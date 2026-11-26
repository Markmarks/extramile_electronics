// admin-actions (Deno / Supabase Edge Function) — docs/07-DESKTOP-ADMIN.md §5.
// The ONLY place privileged work happens. Verifies the caller JWT, re-reads the
// caller's role from profiles server-side, then acts with service_role. Every branch
// is idempotency-keyed (outbox_receipts) and writes audit_log with source + device_id.
// Non-staff are rejected 403 and the attempt is logged (test D-03).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { planRefund } from '../_shared/refund-plan.ts';

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
// Refunds send money back to the customer, so they are admin-only too.
const ADMIN_ONLY = new Set([
  'role_change',
  'staff_invite',
  'device_revoke',
  'device_restore',
  'refund',
]);

// The back-office calls this from a webview, so the browser enforces CORS: it sends an
// OPTIONS preflight first and drops the call unless the response allows the origin.
// Origins: the Tauri app on Windows (WebView2 → http(s)://tauri.localhost), macOS/Linux
// (tauri://localhost), and `vite dev` on :1420. CORS is not the security boundary — every
// call still needs a valid staff/admin JWT and is role-checked below.
const ALLOWED_ORIGINS = new Set([
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:1420',
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ??
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: cors['Access-Control-Allow-Origin'] ? 204 : 403,
      headers: cors,
    });
  }
  const res = await handleRequest(req);
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
});

async function handleRequest(req: Request): Promise<Response> {
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

  // A revoked back-office PC (lost/stolen) may not do privileged work, even with a still-
  // valid session. Unknown device ids are allowed: the app registers itself on unlock.
  if (body.device_id && body.source !== 'web') {
    const { data: dev } = await admin
      .from('staff_devices')
      .select('is_revoked')
      .eq('device_id', body.device_id)
      .limit(1);
    if (dev?.[0]?.is_revoked) {
      await admin.from('audit_log').insert({
        actor: user.id,
        action: `admin_actions.revoked_device.${body.action}`,
        entity: 'staff_devices',
        entity_id: null,
        after: { device_id: body.device_id },
        source: body.source ?? 'desktop',
        device_id: body.device_id,
      });
      return json({ error: 'device_revoked' }, 403);
    }
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
}

async function handle(
  admin: SupabaseClient,
  body: Body,
  actorId: string,
): Promise<Record<string, unknown>> {
  const p = body.payload ?? {};
  switch (body.action) {
    case 'order_transition':
      return orderTransition(
        admin,
        String(p.order_id),
        p.from ? String(p.from) : null,
        String(p.to),
      );
    case 'refund':
      return refund(
        admin,
        String(p.order_id),
        p.amount === undefined || p.amount === null ? null : Number(p.amount),
        actorId,
        typeof p.reason === 'string' && p.reason.trim() ? p.reason.trim().slice(0, 300) : null,
        p.restock !== false,
      );
    case 'role_change':
      return roleChange(admin, String(p.user_id), String(p.role));
    case 'device_revoke':
      return setDeviceRevoked(admin, String(p.device_id), true);
    case 'device_restore':
      return setDeviceRevoked(admin, String(p.device_id), false);
    case 'stock_adjust_large':
      return stockAdjust(
        admin,
        String(p.variant_id),
        Number(p.delta),
        String(p.reason ?? 'adjust'),
        actorId,
      );
    case 'stock_receive':
      return stockReceive(admin, p, actorId);
    case 'walk_in_sale':
      return walkInSale(admin, p, actorId);
    case 'coupon_create_high_value':
      return couponCreate(admin, p);
    case 'staff_invite':
      return staffInvite(admin, String(p.email), (p.role as Role) ?? 'staff');
    default:
      throw new Error(`unknown action: ${body.action}`);
  }
}

// Customer emails on fulfilment milestones — same events/subjects as the storefront's
// advanceOrderAction (apps/web/src/lib/orders/actions.ts), so an order gets exactly one
// email per milestone whichever app moved it (notifications unique slot).
const MILESTONE_EMAIL: Record<
  string,
  { event: string; subject: (n: string) => string; body: (n: string) => string }
> = {
  dispatched: {
    event: 'dispatch',
    subject: (n) => `Order ${n} is on its way`,
    body: (n) => `<p>Order ${n} has been dispatched and is on its way to you.</p>`,
  },
  delivered: {
    event: 'delivery',
    subject: (n) => `Order ${n} delivered`,
    body: (n) => `<p>Order ${n} was delivered. Enjoy — and keep this email for your warranty.</p>`,
  },
};

/**
 * Move an order one step. The database enforces which moves are legal (trigger
 * orders_guard_status, migration 20261124000004); here we add the optimistic check —
 * `from` is the status the staff member was looking at, so a change made meanwhile on
 * the storefront (e.g. a refund) is never overwritten — then email the customer.
 */
async function orderTransition(
  admin: SupabaseClient,
  orderId: string,
  from: string | null,
  to: string,
): Promise<Record<string, unknown>> {
  let q = admin.from('orders').update({ status: to }).eq('id', orderId);
  if (from) q = q.eq('status', from);
  const { data, error } = await q.select('id, order_number, email');
  if (error) {
    const m = error.message.match(/(INVALID_TRANSITION|PAID_ORDER_NEEDS_REFUND)[^\n]*/);
    throw new Error(m ? m[0] : error.message);
  }
  const order = data?.[0] as { id: string; order_number: string; email: string } | undefined;
  if (!order) {
    const { data: cur } = await admin.from('orders').select('status').eq('id', orderId).limit(1);
    if (!cur?.[0]) throw new Error('order_not_found');
    throw new Error(`STALE: order is now ${cur[0].status}, not ${from} — reload and try again`);
  }

  let emailed: string = 'none';
  const milestone = MILESTONE_EMAIL[to];
  if (milestone) emailed = await notifyOnce(admin, order, milestone);
  return { orderId, from, to, emailed };
}

async function notifyOnce(
  admin: SupabaseClient,
  order: { id: string; order_number: string; email: string },
  m: { event: string; subject: (n: string) => string; body: (n: string) => string },
): Promise<string> {
  // The unique (order_id, event, channel) row reserves the send; a duplicate means sent.
  const { error: slotErr } = await admin
    .from('notifications')
    .insert({ order_id: order.id, event: m.event, channel: 'email' });
  if (slotErr) return 'duplicate';

  const release = () =>
    admin
      .from('notifications')
      .delete()
      .eq('order_id', order.id)
      .eq('event', m.event)
      .eq('channel', 'email');

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromAddr = Deno.env.get('RESEND_FROM');
  if (!apiKey || !fromAddr) {
    await release(); // not configured: keep the slot free so a later retry can send
    return 'skipped_not_configured';
  }
  const { data: sup } = await admin
    .from('email_suppressions')
    .select('email')
    .eq('email', order.email.toLowerCase())
    .limit(1);
  if (sup?.length) return 'suppressed';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddr,
        to: order.email,
        subject: m.subject(order.order_number),
        html: m.body(order.order_number),
      }),
    });
    if (!res.ok) throw new Error(`resend_${res.status}`);
    return 'sent';
  } catch {
    await release(); // email failure never blocks the status change
    return 'failed';
  }
}

async function refund(
  admin: SupabaseClient,
  orderId: string,
  amount: number | null,
  actorId: string,
  reason: string | null = null,
  restock = true,
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
    .select('id, reference, provider')
    .eq('order_id', orderId)
    .eq('status', 'paid')
    .limit(1);
  const payment = payments?.[0];
  if (!payment) throw new Error('no_paid_payment');
  // A walk-in sale was paid in cash / MoMo at the counter, not through Paystack: there is
  // no Paystack transaction to refund, so never call Paystack with its reference.
  if (payment.provider === 'manual') throw new Error('manual_payment_refund_in_store');

  // What has already gone back to the customer: a refund may never exceed what is left,
  // and two partial refunds that add up to the total count as a full refund.
  const { data: past } = await admin.from('refunds').select('amount').eq('order_id', orderId);
  const alreadyRefunded = (past ?? []).reduce((n, r) => n + Number(r.amount), 0);
  const plan = planRefund(Number(order.total), alreadyRefunded, amount);
  if (!plan.ok) throw new Error(plan.error);
  const refundAmount = plan.amount;
  if (!PAYSTACK_SECRET) throw new Error('paystack_not_configured');

  // Paystack refund (subunit = pesewas).
  const res = await fetch('https://api.paystack.co/refund', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: payment.reference, amount: refundAmount }),
  });
  if (!res.ok) throw new Error(`paystack_refund_${res.status}`);

  const { error: insErr } = await admin.from('refunds').insert({
    order_id: orderId,
    payment_id: payment.id,
    amount: refundAmount,
    reason,
    status: 'processing',
    actor: actorId,
  });
  if (insErr) throw new Error(`refund_record_failed: ${insErr.message}`);

  const full = plan.full;
  // The money has already gone back at this point, so a failure here must be loud (the
  // refunds row above records it either way).
  const { error: updErr } = await admin
    .from('orders')
    .update({
      payment_status: full ? 'refunded' : 'partially_refunded',
      status: full ? 'refunded' : undefined,
    })
    .eq('id', orderId);
  if (updErr) throw new Error(`refunded_but_order_not_updated: ${updErr.message}`);

  if (full && restock) {
    // Goods came back: restore stock via inventory movements. (Skip with restock=false
    // when the customer keeps the item, e.g. a goodwill refund.)
    const { data: items } = await admin
      .from('order_items')
      .select('variant_id, qty')
      .eq('order_id', orderId);
    for (const it of items ?? []) {
      if (!it.variant_id) continue;
      // Atomic: adjust_stock does the arithmetic in one UPDATE and logs the movement.
      const { error } = await admin.rpc('adjust_stock', {
        p_variant: it.variant_id,
        p_delta: it.qty,
        p_reason: 'return',
        p_actor: actorId,
        p_order: orderId,
      });
      if (error) throw new Error(`restock_failed: ${error.message}`);
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

async function setDeviceRevoked(
  admin: SupabaseClient,
  deviceId: string,
  revoked: boolean,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('staff_devices')
    .update({ is_revoked: revoked })
    .eq('device_id', deviceId)
    .select('device_id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('device_not_found');
  return { deviceId, revoked };
}

async function stockAdjust(
  admin: SupabaseClient,
  variantId: string,
  delta: number,
  reason: string,
  actorId: string,
): Promise<Record<string, unknown>> {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('invalid_delta');
  // One atomic UPDATE in the database (migration 20261124000006) — a read-then-write here
  // could overwrite a sale committed in between.
  const { data, error } = await admin.rpc('adjust_stock', {
    p_variant: variantId,
    p_delta: delta,
    p_reason: reason,
    p_actor: actorId,
  });
  if (error) {
    const m = error.message.match(/(WOULD_GO_BELOW_RESERVED|VARIANT_NOT_FOUND|INVALID_DELTA)/);
    throw new Error(m ? m[0].toLowerCase() : error.message);
  }
  return { variantId, delta, stock: data as number };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Goods in from a supplier: +qty with unit cost (pesewas) and supplier on the movement. */
async function stockReceive(
  admin: SupabaseClient,
  p: Record<string, unknown>,
  actorId: string,
): Promise<Record<string, unknown>> {
  const variantId = String(p.variant_id ?? '');
  const qty = Number(p.qty);
  const cost = p.unit_cost === null || p.unit_cost === undefined ? null : Number(p.unit_cost);
  const supplier = typeof p.supplier === 'string' ? p.supplier.slice(0, 120) : null;
  if (!UUID_RE.test(variantId)) throw new Error('variant_not_found');
  if (!Number.isInteger(qty) || qty < 1 || qty > 10000) throw new Error('invalid_qty');
  if (cost !== null && (!Number.isSafeInteger(cost) || cost < 0)) throw new Error('invalid_cost');

  const { data, error } = await admin.rpc('receive_stock', {
    p_variant: variantId,
    p_qty: qty,
    p_unit_cost: cost,
    p_supplier: supplier,
    p_actor: actorId,
  });
  if (error) {
    const m = error.message.match(/(VARIANT_NOT_FOUND|INVALID_QTY|INVALID_COST)/);
    throw new Error(m ? m[0].toLowerCase() : error.message);
  }
  return { variantId, qty, unitCost: cost, stock: data as number };
}

/**
 * In-store sale paid at the counter. Only variant ids, quantities and serials come from the
 * app — prices, totals and stock checks happen in create_walk_in_order(). The outbox
 * replays this with the same idempotency key, so an offline sale is recorded once.
 */
async function walkInSale(
  admin: SupabaseClient,
  p: Record<string, unknown>,
  actorId: string,
): Promise<Record<string, unknown>> {
  const method = String(p.method ?? '');
  if (method !== 'cash' && method !== 'momo') throw new Error('invalid_method');
  if (!Array.isArray(p.items) || p.items.length === 0 || p.items.length > 50) {
    throw new Error('empty_sale');
  }
  const items = p.items.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const variantId = String(it.variant_id ?? '');
    const qty = Number(it.qty);
    if (!UUID_RE.test(variantId)) throw new Error('variant_not_found');
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new Error('invalid_qty');
    const serials = Array.isArray(it.serials)
      ? it.serials
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 100)
      : [];
    return { variant_id: variantId, qty, serials };
  });
  const text = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

  const { data, error } = await admin.rpc('create_walk_in_order', {
    p_items: items,
    p_method: method,
    p_email: text(p.email, 254),
    p_phone: text(p.phone, 20),
    p_customer: text(p.customer, 120),
    p_actor: actorId,
  });
  if (error) {
    const m = error.message.match(
      /(INSUFFICIENT_STOCK|VARIANT_NOT_FOUND|INVALID_QTY|INVALID_METHOD|EMPTY_SALE|TOO_MANY_LINES)/,
    );
    throw new Error(m ? m[0].toLowerCase() : error.message);
  }
  const order = data as { id: string; order_number: string; total: number };
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    total: order.total,
    method,
    localRef: text(p.local_ref, 40),
  };
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
