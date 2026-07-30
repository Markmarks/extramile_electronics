# Test Plan

Tools: **Vitest** (unit/integration) · **Playwright** (E2E) · **pgTAP or Vitest+pg** (RLS/DB) · **k6** (load) · **axe-core** (a11y) · **Lighthouse CI**.
Exit criteria: 100% of P0 cases pass; zero open P0/P1 defects; coverage ≥ 90% on `lib/pricing`, `lib/paystack`, `lib/cart`.

## 1. Unit — pricing & cart (P0)

| ID | Case | Expected |
|---|---|---|
| U-01 | Line total = unit_price × qty in pesewas | no float drift; `2999 × 3 = 8997` |
| U-02 | Percent coupon 10% on GHS 1,499.99 | discount 14999 pesewas, integer division floor |
| U-03 | Fixed coupon > subtotal | discount capped at subtotal, total ≥ 0 |
| U-04 | Free-shipping coupon | shipping_fee = 0, subtotal untouched |
| U-05 | Free-over threshold met exactly | fee 0 at `subtotal == free_over` |
| U-06 | Coupon below min_subtotal | rejected `INVALID_COUPON` |
| U-07 | Expired / not-yet-started coupon | rejected |
| U-08 | Coupon at max_redemptions | rejected |
| U-09 | Qty clamp | qty > 20 or > available → rejected |
| U-10 | GHS formatting | `8997` → `GH₵ 89.97`; never `89.969999` |
| U-11 | MSISDN normaliser | `0244123456`, `244123456`, `+233244123456` → `+233244123456`; `+2330244…` rejected |
| U-12 | Order number generator | matches `^EL-\d{8}-[A-F0-9]{6}$`, 10k iterations no collision |

## 2. Unit — Paystack adapter (P0)

| ID | Case | Expected |
|---|---|---|
U-20 | Amount conversion | GHS 1,299.50 → `129950`, integer
U-21 | Signature valid | HMAC-SHA512 of **raw** body with secret matches header → accept
U-22 | Signature invalid / missing | 401, nothing written
U-23 | Signature computed on parsed-then-restringified body | must FAIL (regression guard — verify raw bytes only)
U-24 | Verify amount mismatch (paid 100 < total 129950) | order not fulfilled, flagged
U-25 | Verify currency ≠ GHS | rejected
U-26 | Verify status `failed`/`abandoned` | `payment_status=failed`, stock reservation released
U-27 | Paystack 5xx on initialize | retry ×2 with backoff, then user-facing fallback message
U-28 | Network timeout on verify | order left `pending`, reconciler retries

## 3. Integration — DB / RPC (P0)

| ID | Case | Expected |
|---|---|---|
I-01 | `create_order` with stale client price | server price wins; order total from DB
I-02 | `create_order` with `stock - reserved < qty` | raises `INSUFFICIENT_STOCK`, no order row
I-03 | `create_order` empty cart | raises `EMPTY_CART`
I-04 | `create_order` inactive variant | excluded/rejected
I-05 | `commit_paid_order` twice | second call is a no-op; stock decremented once
I-06 | Two concurrent orders for last unit (parallel txns) | one commits, other → `oversold`, refund queued
I-07 | `release_expired_reservations` | `reserved` restored, order `cancelled`, stock unchanged
I-08 | Order items snapshot immutable | changing variant price after order does not alter `order_items.unit_price`
I-09 | `inventory_movements` audit | one row per sale line, delta negative
I-10 | Cart merge on login | duplicate variant quantities summed, capped at stock, guest cart deleted

## 4. Security — RLS (P0, blocking gate)

Run as anon key, user A, user B, staff. Every case must be verified with the **anon/authed client**, not `service_role`.

| ID | Case | Expected |
|---|---|---|
S-01 | User B `select * from orders` where order belongs to A | 0 rows
S-02 | User B selects A's `order_items` / `payments` by id | 0 rows
S-03 | Anon selects `products` where `is_active=false` | 0 rows
S-04 | Anon reads `webhook_events`, `audit_log`, `refunds` | 0 rows / permission denied
S-05 | User A `update profiles set role='admin'` | rejected (role pinned by policy)
S-06 | User A inserts `orders` directly | rejected (no insert policy)
S-07 | User A updates own order `total` | rejected
S-08 | User A inserts review without delivered order | rejected
S-09 | User B reads A's addresses / wishlist | 0 rows
S-10 | Non-staff GET `/admin/*` | 404 (middleware) **and** RLS denies underlying query
S-11 | `service_role` key in client bundle | absent — `grep -r "service_role" .next/static` empty
S-12 | Every public table has `relrowsecurity = true` | 0 rows returned by the check query

## 5. Payments E2E (P0)

Paystack **test** keys. Test instruments: success card `4084 0840 8408 4081` (CVV 408, any future expiry, PIN 0000, OTP 123456); declined card `4084 0800 0000 5408`; test mobile money via Paystack test MoMo.

| ID | Case | Expected |
|---|---|---|
P-01 | Card success end-to-end | webhook → verify → `paid`/`confirmed`, stock −1, receipt email, callback page flips to success by polling
P-02 | Mobile money success | same as P-01, `payments.channel='mobile_money'`
P-03 | Declined card | `failed`, reservation released, cart intact, retry offered
P-04 | User abandons on Paystack page | order `pending` → cancelled at T+15m by cron
P-05 | Duplicate webhook (same event id ×3) | 200 each, stock decremented once, one email
P-06 | Webhook arrives before callback redirect | success page already shows paid (no double fulfil)
P-07 | Webhook never arrives | reconciler at T+10m verifies and fulfils
P-08 | Tampered webhook body, valid-looking JSON | 401, no state change
P-09 | Webhook for unknown reference | 200 logged, no state change, alert raised
P-10 | Amount tampered in webhook payload | verify-call amount wins → rejected, flagged
P-11 | Full refund from admin | `refunded`, stock restored via movement, email sent
P-12 | Partial refund | `partially_refunded`, amounts reconcile
P-13 | Reference reuse after failure | new reference generated for same order; old one cannot fulfil

## 6. E2E — Playwright (P1 unless noted)

| ID | Case |
|---|---|
E-01 (P0) | Guest: search "iPhone 15" → PDP → select 256GB/Titanium → add → checkout → pay → order confirmed
E-02 (P0) | Returning user: OAuth Google login → saved address → reorder → pay
E-03 | Variant switch updates price, images, stock badge, and URL
E-04 | Out-of-stock variant: add-to-cart disabled, notify-me shown
E-05 | Facet filter + sort + pagination preserved in URL, survive reload and back button
E-06 | Cart persists across reload (guest cookie) and across devices after login
E-07 | Stale price banner when variant price changes mid-session
E-08 | Coupon apply/remove updates totals; invalid code shows inline error
E-09 | Zone change updates shipping fee and ETA
E-10 | Order timeline reflects admin status changes; email sent per transition
E-11 | Admin creates product + variants + images → visible on storefront after publish
E-12 | CSV import updates prices by SKU, rejects malformed rows with a report
E-13 | Serial/IMEI capture at packing appears on warranty card PDF
E-14 | Mobile viewport (390×844): full purchase flow, no horizontal scroll

## 7. Non-functional

| ID | Case | Target |
|---|---|---|
N-01 | Lighthouse mobile PDP | perf ≥ 90, a11y ≥ 95, SEO 100
N-02 | k6: 200 VU browsing 5 min | p95 < 800ms, error rate < 0.5%
N-03 | k6: 50 concurrent checkouts | zero oversell, zero duplicate orders
N-04 | Search at 10k products | p95 < 200ms
N-05 | axe-core on home/PLP/PDP/cart/checkout | 0 critical violations
N-06 | Keyboard-only checkout | completable, visible focus throughout
N-07 | Offline/flaky 3G at payment step | clear state, no double-charge on retry
N-08 | Bundle size, first load JS | < 200KB gzip on PDP
N-09 | Security headers | CSP, HSTS, X-Frame-Options, Referrer-Policy present
N-10 | Rate limit | 6th login attempt/min blocked; 30th search/min throttled

## 8. UAT (staff, pre-launch)
1. Publish a real SKU from scratch, verify storefront rendering and spec table.
2. Place a live GHS 1.00 order with real MoMo, confirm receipt and dashboard match.
3. Fulfil it: pack (capture IMEI) → dispatch → delivered; confirm all emails/SMS.
4. Refund it; confirm money returned and stock restored.
5. Reconciliation view shows the Paystack settlement matching the order.

## 9. Regression suite (run every PR)
U-01→U-28, I-01→I-10, S-01→S-12, P-01/P-03/P-05/P-07, E-01/E-02. Full suite nightly against staging.
