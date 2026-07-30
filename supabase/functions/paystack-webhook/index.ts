// Paystack webhook (Deno / Supabase Edge Function).
// docs/01-PRD.md §4.5, docs/06-BUILD-PROMPTS.md P7:
//   1. HMAC-SHA512 the RAW body, timing-safe compare -> 401 on mismatch.
//   2. Idempotency: webhook_events.event_id (the signature) as PK; replay -> 200 no-op.
//   3. charge.success -> independently GET /transaction/verify/:reference, assert
//      status/amount/currency, then commit_paid_order.
//   4. Always respond 200 once recorded; never let a downstream error loop retries.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const encoder = new TextEncoder();

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  const raw = await req.text(); // RAW bytes — do not parse before verifying
  const signature = req.headers.get('x-paystack-signature');
  const expected = await hmacSha512Hex(PAYSTACK_SECRET, raw);

  if (!signature || !timingSafeEqual(expected, signature)) {
    return new Response('invalid signature', { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const event = JSON.parse(raw) as { event: string; data: { reference?: string } };

  // Idempotency: the signature is our stable event id.
  const { error: insertErr } = await admin.from('webhook_events').insert({
    event_id: expected,
    event_type: event.event,
    payload: event,
  });
  if (insertErr) {
    // Unique violation => replay. Acknowledge and stop.
    return new Response(JSON.stringify({ replay: true }), { status: 200 });
  }

  try {
    if (event.event === 'charge.success' && event.data.reference) {
      await fulfil(admin, event.data.reference);
    }
    await admin
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', expected);
  } catch (err) {
    // Record but still 200 — Paystack must not retry into an infinite loop.
    await admin
      .from('webhook_events')
      .update({ error: err instanceof Error ? err.message : 'unknown' })
      .eq('event_id', expected);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});

async function fulfil(admin: ReturnType<typeof createClient>, reference: string): Promise<void> {
  const { data: payments } = await admin
    .from('payments')
    .select('id, order_id')
    .eq('reference', reference)
    .limit(1);
  const payment = payments?.[0];
  if (!payment) return; // unknown reference — logged via webhook_events, no state change (P-09)

  const { data: orders } = await admin
    .from('orders')
    .select('id, order_number, email, total, currency')
    .eq('id', payment.order_id)
    .limit(1);
  const order = orders?.[0];
  if (!order) return;

  // Independently verify with Paystack — never trust the webhook body's amount (P-10).
  const vr = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    },
  );
  const vj = (await vr.json()) as {
    data?: {
      status?: string;
      amount?: number;
      currency?: string;
      channel?: string;
      id?: number;
      paid_at?: string;
    };
  };
  const d = vj.data;

  const ok =
    d && d.status === 'success' && d.amount === order.total && d.currency === order.currency;
  if (!ok) {
    await admin.from('payments').update({ status: 'mismatch', raw: vj }).eq('id', payment.id);
    return; // leave order unfulfilled, flagged for the reconciliation view
  }

  const { error: commitErr } = await admin.rpc('commit_paid_order', { p_order_id: order.id });
  if (commitErr) throw commitErr; // OVERSOLD etc. — recorded on webhook_events.error

  await admin
    .from('payments')
    .update({
      status: 'paid',
      channel: d.channel ?? null,
      provider_txn_id: d.id ? String(d.id) : null,
      paid_at: d.paid_at ?? new Date().toISOString(),
      raw: vj,
    })
    .eq('id', payment.id);

  // Exactly-once payment receipt (unique notifications row reserves the slot).
  const { error: notifErr } = await admin
    .from('notifications')
    .insert({ order_id: order.id, event: 'payment_receipt', channel: 'email' });
  if (!notifErr) {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('RESEND_FROM');
    if (apiKey && from) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: order.email,
          subject: `Payment received — order ${order.order_number}`,
          html: `<p>Your payment for order ${order.order_number} is confirmed (ref ${reference}).</p>`,
        }),
      }).catch(() => {});
    }
  }
}
