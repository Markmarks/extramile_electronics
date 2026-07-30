# Runbook

Operational playbook for ExtraMile Electronics. P0 = payment/auth incidents.

## Webhook down / signature failures spiking
- Symptom: paid orders staying `pending`; `webhook_events` errors or none arriving.
- The `reconcile-payments` Edge Function (every 10 min via pg_cron) re-verifies and fulfils
  pending orders older than 10 min, so paid-but-unfulfilled self-heals. To force it now:
  `supabase functions invoke reconcile-payments`.
- Check the Paystack dashboard webhook URL and that `PAYSTACK_SECRET_KEY` matches the signing
  secret. A signature-failure spike usually means a key mismatch after rotation.

## Paystack outage (initialize failing)
- `/api/checkout/pay` returns 502 and the order stays `pending` with stock reserved 15 min.
- Storefront copy already offers "try again"; the reservation is released by the
  `release-reservations` cron if the customer abandons.

## Oversold order
- `commit_paid_order` raises `OVERSOLD` when stock < qty at commit; the webhook records it on
  `webhook_events.error` and the order shows in the admin `oversold` filter.
- Action: refund via the desktop admin (Edge Function `admin-actions`), restock, email the
  customer. Investigate the race (usually concurrent last-unit purchases).

## Restore from PITR
- Supabase dashboard → Database → Backups → Point-in-time recovery. Pick a timestamp just
  before the incident. Rehearse quarterly. Confirm RLS still enabled afterwards
  (`scripts/check-rls.sql` returns 0 rows).

## Rotate keys
- `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`: rotate in the provider,
  update Vercel + Supabase Function secrets, redeploy. After rotating the Paystack secret,
  re-check webhook signature verification immediately (see above).

## Roll back a deploy
- Vercel → Deployments → previous → Promote to Production. A failed post-deploy smoke test
  (`/api/health`, PDP, test Paystack init) triggers automatic rollback.

## Rate limiting → Upstash (production)
- `src/lib/rate-limit.ts` is a per-instance in-memory limiter. For multi-instance prod, set
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and back the limiter with a shared
  Upstash counter (INCR + PEXPIRE). Endpoints limited: `/api/checkout/*`, auth, search, webhook.

## Deferred to wire before launch
- Sentry (client/server/edge) with PII scrubbing + alert rules (payment-failure spike,
  paid > 5 min unconfirmed, 5xx, webhook signature failures).
- axe-core CI on home/PLP/PDP/cart/checkout.
- Invoice/warranty PDF generation into the private `invoices` bucket (currently a printable
  HTML invoice); SMS on dispatch/delivery via the Hubtel provider interface.
