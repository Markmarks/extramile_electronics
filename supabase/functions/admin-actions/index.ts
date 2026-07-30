// admin-actions (Deno / Supabase Edge Function) — docs/07-DESKTOP-ADMIN.md §5.
// The ONLY place privileged work happens. Verifies the caller JWT, re-reads the
// caller's role from profiles server-side, then acts with service_role. Every branch
// is idempotency-keyed (outbox_receipts) and writes audit_log with source + device_id.
// Non-staff are rejected 403 and the attempt is logged (test D-03).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';

type Role = 'customer' | 'staff' | 'admin';

interface Body {
  action: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  device_id?: string;
  source?: string; // 'desktop' | 'web'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Actions only an admin (not staff) may perform.
const ADMIN_ONLY = new Set(['role_change', 'staff_invite']);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthenticated' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Re-read role server-side — never trust a claim from the client.
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).limit(1);
  const role = (profile?.[0]?.role ?? 'customer') as Role;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body.action || !body.idempotency_key) {
    return json({ error: 'missing action or idempotency_key' }, 400);
  }

  const isStaff = role === 'staff' || role === 'admin';
  const allowed = isStaff && (!ADMIN_ONLY.has(body.action) || role === 'admin');
  if (!allowed) {
    await admin.from('audit_log').insert({
      actor: user.id,
      action: `admin_actions.denied.${body.action}`,
      entity: 'admin_actions',
      entity_id: null,
      after: { role, device_id: body.device_id ?? null },
      source: body.source ?? 'desktop',
      device_id: body.device_id ?? null,
    });
    return json({ error: 'forbidden' }, 403);
  }

  // Idempotency: reserve the key; replay returns the stored result.
  const { error: reserveErr } = await admin.from('outbox_receipts').insert({
    idempotency_key: body.idempotency_key,
    device_id: body.device_id ?? 'unknown',
    kind: body.action,
  });
  if (reserveErr) {
    const { data: prior } = await admin
      .from('outbox_receipts')
      .select('result')
      .eq('idempotency_key', body.idempotency_key)
      .limit(1);
    return json({ replay: true, result: prior?.[0]?.result ?? null });
  }

  let result: unknown;
  try {
    result = await handle(admin, body, user.id);
  } catch (err) {
    await admin.from('outbox_receipts').delete().eq('idempotency_key', body.idempotency_key); // release for retry
    return json({ error: err instanceof Error ? err.message : 'action_failed' }, 400);
  }

  await admin.from('audit_log').insert({
    actor: user.id,
    action: `admin_actions.${body.action}`,
    entity: 'admin_actions',
    entity_id: null,
    after: result as Record<string, unknown>,
    source: body.source ?? 'desktop',
    device_id: body.device_id ?? null,
  });
  await admin
    .from('outbox_receipts')
    .update({ result: result as Record<string, unknown> })
    .eq('idempotency_key', body.idempotency_key);

  return json({ ok: true, result });
});

async function handle(
  admin: SupabaseClient,
  body: Body,
  actorId: string,
): Promise<Record<string, unknown>> {
  const p = body.payload ?? {};
  switch (body.action) {
    case 'refund':
      return refund(admin, String(p.order_id), p.amount ? Number(p.amount) : null, actorId);
    case 'role_change':
      return roleChange(admin, String(p.user_id), String(p.role));
    case 'device_revoke':
      return deviceRevoke(admin, String(p.device_id));
    case 'stock_adjust_large':
      return stockAdjust(
        admin,
        String(p.variant_id),
        Number(p.delta),
        String(p.reason ?? 'adjust'),
        actorId,
      );
    case 'coupon_create_high_value':
      return couponCreate(admin, p);
    case 'staff_invite':
      return staffInvite(admin, String(p.email), (p.role as Role) ?? 'staff');
    default:
      throw new Error(`unknown action: ${body.action}`);
  }
}

async function refund(
  admin: SupabaseClient,
  orderId: string,
  amount: number | null,
  actorId: string,
): Promise<Record<string, unknown>> {
  const { data: orders } = await admin
    .from('orders')
    .select('id, total')
    .eq('id', orderId)
    .limit(1);
  const order = orders?.[0];
  if (!order) throw new Error('order_not_found');

  const { data: payments } = await admin
    .from('payments')
    .select('id, reference')
    .eq('order_id', orderId)
    .eq('status', 'paid')
    .limit(1);
  const payment = payments?.[0];
  if (!payment) throw new Error('no_paid_payment');

  const refundAmount = amount ?? order.total;

  // Paystack refund (subunit = pesewas).
  const res = await fetch('https://api.paystack.co/refund', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: payment.reference, amount: refundAmount }),
  });
  if (!res.ok) throw new Error(`paystack_refund_${res.status}`);

  await admin.from('refunds').insert({
    order_id: orderId,
    payment_id: payment.id,
    amount: refundAmount,
    status: 'processing',
    actor: actorId,
  });

  const full = refundAmount >= order.total;
  await admin
    .from('orders')
    .update({
      payment_status: full ? 'refunded' : 'partially_refunded',
      status: full ? 'refunded' : undefined,
    })
    .eq('id', orderId);

  if (full) {
    // Restore stock via inventory movements.
    const { data: items } = await admin
      .from('order_items')
      .select('variant_id, qty')
      .eq('order_id', orderId);
    for (const it of items ?? []) {
      if (!it.variant_id) continue;
      const { data: v } = await admin
        .from('product_variants')
        .select('stock')
        .eq('id', it.variant_id)
        .limit(1);
      const stock = v?.[0]?.stock ?? 0;
      await admin
        .from('product_variants')
        .update({ stock: stock + it.qty })
        .eq('id', it.variant_id);
      await admin
        .from('inventory_movements')
        .insert({
          variant_id: it.variant_id,
          delta: it.qty,
          reason: 'return',
          order_id: orderId,
          actor: actorId,
        });
    }
  }
  return { orderId, refundAmount, full };
}

async function roleChange(
  admin: SupabaseClient,
  userId: string,
  role: string,
): Promise<Record<string, unknown>> {
  if (!['customer', 'staff', 'admin'].includes(role)) throw new Error('invalid_role');
  const { error } = await admin.from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(error.message);
  return { userId, role };
}

async function deviceRevoke(
  admin: SupabaseClient,
  deviceId: string,
): Promise<Record<string, unknown>> {
  const { error } = await admin
    .from('staff_devices')
    .update({ is_revoked: true })
    .eq('device_id', deviceId);
  if (error) throw new Error(error.message);
  return { deviceId, revoked: true };
}

async function stockAdjust(
  admin: SupabaseClient,
  variantId: string,
  delta: number,
  reason: string,
  actorId: string,
): Promise<Record<string, unknown>> {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('invalid_delta');
  const { data: v } = await admin
    .from('product_variants')
    .select('stock')
    .eq('id', variantId)
    .limit(1);
  const stock = v?.[0]?.stock;
  if (stock === undefined) throw new Error('variant_not_found');
  const next = stock + delta;
  if (next < 0) throw new Error('would_go_negative');
  await admin.from('product_variants').update({ stock: next }).eq('id', variantId);
  await admin
    .from('inventory_movements')
    .insert({ variant_id: variantId, delta, reason, actor: actorId });
  return { variantId, delta, stock: next };
}

async function couponCreate(
  admin: SupabaseClient,
  p: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const row = {
    code: String(p.code),
    kind: String(p.kind),
    value: Number(p.value ?? 0),
    min_subtotal: Number(p.min_subtotal ?? 0),
    max_redemptions: p.max_redemptions ? Number(p.max_redemptions) : null,
  };
  const { error } = await admin.from('coupons').insert(row);
  if (error) throw new Error(error.message);
  return { code: row.code };
}

async function staffInvite(
  admin: SupabaseClient,
  email: string,
  role: Role,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) throw new Error(error.message);
  if (data.user) await admin.from('profiles').update({ role }).eq('id', data.user.id);
  return { email, role };
}
