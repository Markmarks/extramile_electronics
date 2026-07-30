// Reconciler (Deno / Supabase Edge Function), run every 10 min by pg_cron.
// docs/06-BUILD-PROMPTS.md P7 #5: for every pending order older than 10 min with a
// payment reference, verify with Paystack and fulfil or fail. Guarantees the metric
// "0 paid-but-unfulfilled" when a webhook is lost (P-07).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: orders } = await admin
    .from('orders')
    .select('id, total, currency, created_at, payment_status, status')
    .eq('status', 'pending')
    .eq('payment_status', 'unpaid')
    .lt('created_at', tenMinAgo)
    .limit(200);

  let fulfilled = 0;
  let failed = 0;

  for (const order of orders ?? []) {
    const { data: payments } = await admin
      .from('payments')
      .select('id, reference, status')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false });

    for (const payment of payments ?? []) {
      if (payment.status === 'paid') break;
      const vr = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.reference)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
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
      if (!d) continue;

      if (d.status === 'success' && d.amount === order.total && d.currency === order.currency) {
        const { error } = await admin.rpc('commit_paid_order', { p_order_id: order.id });
        if (!error) {
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
          fulfilled += 1;
        }
        break;
      }

      if (d.status === 'failed' || d.status === 'abandoned') {
        await admin.from('payments').update({ status: 'failed', raw: vj }).eq('id', payment.id);
        failed += 1;
      }
    }
  }

  return new Response(JSON.stringify({ checked: orders?.length ?? 0, fulfilled, failed }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
