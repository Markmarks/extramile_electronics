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

## Desktop: bad release rollback (D-08)
- Keep the previous two installers on the GitHub Release. Point the updater manifest
  (`latest.json`) back at the pinned previous version; the minisign signature must match or
  clients reject the update. Staff on the bad build reinstall the previous signed MSI.
- The release job (`.github/workflows/desktop-release.yml`) publishes a **draft** release —
  smoke-test the installer on a clean Windows 11 VM (SmartScreen, first-run OAuth, printer
  discovery) before publishing.

## Desktop: revoke a device (D-15)
- Call `admin-actions` `device_revoke` (sets `staff_devices.is_revoked`). On the device's next
  token refresh it is signed out. Use when a counter PC is lost or decommissioned.

## Desktop: printer down (D-09)
- Print failures surface as a typed toast and **never change order state**; reprint from the
  order detail once the printer is back. Check the printer selection in Settings; run
  `print_test`. Receipts are ESC/POS spooled — verify the spool file if raw output looks wrong.

## Desktop: extended outage with a full outbox
- Writes queue locally (`outbox`) and replay in order per order id on reconnect; the server
  dedupes on `outbox_receipts.idempotency_key`, so replay after a mid-flush crash is safe.
- Monitor `outbox_pending()` growth; a stuck item shows an `error` and blocks later items for
  the same order (surfaced as a conflict for staff to resolve).

## Pending configuration (open since 2026-11-24)
The Supabase project moved to `odthylkirynqszhrrccj` on 2026-11-24. Production on Vercel
(extramileelectronics.vercel.app) has the Supabase URL, anon key and service-role key, and
`/api/health` reports `"db":"ok"`. Still to do. Secrets are pasted by a person, never by an agent:

- **Vercel → extramile_electronics → Settings → Environment Variables**
  - Tick **Preview** on `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL`. Preview deployments (every push
    to a non-production branch) have no Supabase config until this is done.
  - Add for Production + Preview: `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
    (`sk_test_`/`pk_test_` until go-live), `RESEND_API_KEY`, `RESEND_FROM`
    (e.g. `ExtraMile Electronics <orders@yourdomain>`).
- **Supabase → Edge Functions → Secrets**: add `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`,
  `RESEND_FROM`. Without them `paystack-webhook` rejects every callback, so paid orders are
  never confirmed and the expiry job cancels them after 15 minutes. `admin-actions` can't
  refund or send dispatch/delivery emails either.
- **Schedule `reconcile-pending`** (the safety net for missed webhooks). See the comment at
  the end of `supabase/migrations/20260729000007_rpcs.sql`.
- **Product images**: the 30 `seed/*.webp` files referenced by `product_images` are not in
  the `product-images` bucket yet, so the storefront shows broken images.
- After changing Vercel variables, **Redeploy** production (Deployments → ⋯ → Redeploy).
  Then check `curl https://extramileelectronics.vercel.app/api/health` reports
  `"db":"ok"`, and place a test order with a Paystack test card.

## Deferred to wire before launch
- Sentry (client/server/edge) with PII scrubbing + alert rules (payment-failure spike,
  paid > 5 min unconfirmed, 5xx, webhook signature failures).
- axe-core CI on home/PLP/PDP/cart/checkout.
- Invoice/warranty PDF generation into the private `invoices` bucket (currently a printable
  HTML invoice); SMS on dispatch/delivery via the Hubtel provider interface.
