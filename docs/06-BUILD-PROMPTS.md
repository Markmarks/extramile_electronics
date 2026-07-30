# Build Prompts

Run in order in Claude Code from the repo root. Each is self-contained. Do not skip P0.

## P0 — Context primer (paste once per new session)

```
You are building a production ecommerce webapp for an electronics store in Accra, Ghana.

Stack: Next.js 15 App Router + TypeScript strict, Tailwind + shadcn/ui, Supabase
(Postgres, Auth, Storage, Edge Functions), Paystack, Vercel, Resend.

Non-negotiable rules:
1. Money is bigint pesewas (100 = GHS 1). Never floats, never client-supplied prices.
2. RLS on every table. Server-only secrets: SUPABASE_SERVICE_ROLE_KEY, PAYSTACK_SECRET_KEY.
   Never NEXT_PUBLIC_ them, never import them into a Client Component.
3. Authorization uses supabase.auth.getUser() on the server, never getSession().
4. Order totals and stock checks happen in Postgres RPCs, not in TypeScript.
5. Paystack webhooks: verify HMAC SHA512 over the RAW body, then independently call
   /transaction/verify/:reference before fulfilling. Idempotent on event id.
6. Every DB change is a file in supabase/migrations/. No dashboard edits.
7. TypeScript strict, no `any`, Zod-validate every route input.

Reference docs in ./docs: 01-PRD.md, 02-DATA-MODEL.md, 03-SDLC.md, 04-TEST-PLAN.md, 05-OAUTH.md.
Read the relevant one before implementing. Ask before inventing schema.
```

## P1 — Scaffold

```
Initialise the project:
- Next.js 15 (App Router, TS strict, src/ dir), Tailwind, shadcn/ui (init + button, input,
  card, dialog, sheet, select, badge, toast, form, table, skeleton).
- Folders: src/app, src/components/{ui,catalog,cart,checkout,auth,admin},
  src/lib/{supabase,pricing,paystack,cart,email,validation}, supabase/{migrations,functions},
  tests/{unit,e2e,rls}, docs/.
- Vitest + @testing-library/react; Playwright with a mobile 390x844 project.
- ESLint (no-explicit-any error, no-floating-promises), Prettier, Husky pre-commit
  running tsc --noEmit + lint-staged.
- .env.example with every var named in docs/01-PRD.md and docs/05-OAUTH.md, commented
  server-only vs public.
- src/lib/supabase/{client,server,admin}.ts using @supabase/ssr. admin.ts must throw if
  imported in a browser bundle.
- GitHub Actions CI per docs/03-SDLC.md §3.
- src/app/api/health/route.ts returning db connectivity + build sha.

Done when: pnpm build, pnpm test, pnpm lint, tsc --noEmit all pass on a clean checkout.
```

## P2 — Schema & RLS

```
Implement docs/02-DATA-MODEL.md exactly as migrations 001-007 in supabase/migrations/,
timestamped, one file per migration section.

Then:
- supabase/seed.sql: 5 categories with spec_schema, 8 brands, 30 real products (phones,
  laptops, TVs, audio, accessories) with 1-4 variants each, realistic GHS prices in pesewas,
  4 shipping zones (Accra Central 1500, Greater Accra 2500, Other Region 4500, Pickup 0),
  2 coupons, 1 admin + 1 customer test user.
- src/types/database.ts generated via `supabase gen types typescript --local`.
- tests/rls/*.test.ts covering S-01..S-12 in docs/04-TEST-PLAN.md, using the anon key and
  two separate signed-in users. These must fail if any policy is removed.

Done when: `supabase db reset` runs clean from scratch, seeds, and the RLS suite is green.
```

## P3 — Auth + OAuth

```
Implement docs/05-OAUTH.md end to end: browser/server/admin Supabase clients, Google and
Apple sign-in buttons, /auth/callback route handler with PKCE code exchange and validated
`next` param, middleware.ts with session refresh + /account and /admin guards (404 rewrite
for non-staff), email OTP fallback, /login and /account/connected-accounts pages with
linkIdentity/unlinkIdentity, sign-out action clearing cart_token.

Also add tests/unit/auth.test.ts + tests/e2e/auth.spec.ts for O-01..O-12.
Mock the provider handshake in E2E; test the callback route and guards for real.

Done when: OAuth login works locally against the Supabase local stack, /admin 404s for a
customer, and refreshing a page 61 minutes later does not log the user out.
```

## P4 — Catalogue

```
Build the storefront catalogue:
- src/lib/catalog/queries.ts: typed server queries for category tree, PLP with facets +
  cursor pagination, PDP by slug with variants/images/specs, related products.
- Postgres RPC `search_products(q text, filters jsonb, sort text, lim int, cur text)`
  using search_tsv ranking with a pg_trgm similarity fallback for typos. Add it as a migration.
- /(shop)/page.tsx home, /c/[...slug] PLP with URL-state facets (category, brand, price
  min/max, in_stock, condition, spec keys) + sort, /p/[slug] PDP with variant selector
  driving price/images/stock/URL, spec table rendered from category.spec_schema,
  /search page, debounced autocomplete component.
- ISR: revalidate 300 on PLP/PDP, tag-based revalidation on product publish.
- JSON-LD Product/Offer/BreadcrumbList, generateMetadata, next/image with AVIF, sitemap.ts,
  robots.ts.
- Skeletons and empty states for every list.

Done when: E-03..E-05 pass, Lighthouse mobile PDP perf >= 90 / SEO 100, search p95 < 200ms
against the seeded 10k-product fixture.
```

## P5 — Cart

```
Implement the cart:
- Guest cart: httpOnly cart_token cookie (32-byte random), created lazily on first add.
- Server Actions: addItem, updateQty, removeItem, clearCart. All revalidate price, stock,
  and is_active server-side; all Zod-validated; qty capped at min(20, stock - reserved).
- src/lib/cart/merge.ts: mergeGuestCart(token, userId) summing quantities, capping at stock,
  deleting the guest cart. Called from /auth/callback and after email sign-in.
- Cart sheet + /cart page: line items, stale-price banner comparing added_price to live price,
  subtotal, "you save" from compare_at_price, continue-to-checkout.
- Optimistic UI with useOptimistic; roll back and toast on server rejection.

Done when: U-09, I-10, E-06, E-07 pass, and cart survives reload as guest and login as user.
```

## P6 — Checkout

```
Build the 4-step checkout at /checkout (contact, delivery, review, pay):
- Zod schemas per step; MSISDN normaliser to +233XXXXXXXXX (docs/04 U-11).
- Address book for signed-in users; new-address form for guests; zone selector driving fee
  and ETA from shipping_zones.
- Coupon apply/remove calling a server action that validates against the coupons table only.
- Review step totals come exclusively from a server call — the client sends variant ids and
  quantities, never prices.
- POST /api/checkout/create-order: auth optional, Zod-validated, calls the create_order RPC
  via the service-role client, returns { orderNumber, total, orderId }. Map RPC exceptions
  INSUFFICIENT_STOCK / EMPTY_CART / INVALID_COUPON / INVALID_ZONE to typed 4xx responses with
  user-facing copy.
- Rate limit 10 requests/min/IP (Upstash).

Done when: I-01..I-04 pass, and a request with a tampered price in the body produces an
order priced from the database (test T-SEC-03 / U-01).
```

## P7 — Paystack (highest risk — read docs/04-TEST-PLAN.md §5 first)

```
Implement payments:
1. src/lib/paystack/client.ts — typed initialize(), verify(), refund(); amounts in pesewas;
   currency GHS; channels ['mobile_money','card','bank_transfer','ussd']; 2 retries with
   exponential backoff on 5xx/timeouts; never log the secret key.
2. POST /api/checkout/pay — takes orderId, loads the order server-side, generates reference
   `${order_number}-${short random}`, inserts a payments row (status 'initialized'), calls
   initialize with metadata { order_id, order_number }, returns authorization_url.
3. Supabase Edge Function `paystack-webhook`:
   - read the RAW request body as text; compute HMAC SHA512 with PAYSTACK_SECRET_KEY;
     timing-safe compare with the x-paystack-signature header; 401 on mismatch.
   - insert into webhook_events (event id as PK); on conflict return 200 immediately (replay).
   - for charge.success: GET /transaction/verify/:reference; assert status==='success',
     data.amount === order.total, data.currency === 'GHS'; then call commit_paid_order(order_id)
     and update the payments row (channel, provider_txn_id, paid_at, raw).
   - on any assertion failure: mark payment 'mismatch', leave the order unfulfilled, log + alert.
   - always respond 200 to Paystack after the event is recorded; do the work inside the same
     invocation but never let a downstream error cause an infinite retry loop.
4. /checkout/[orderNumber]/processing — polls order payment_status every 2s for 90s, then
   offers "check again"/contact support. Never reads success from query params.
5. Edge Function `reconcile-payments` — for every pending order older than 10 min with a
   reference, verify and fulfil or fail. Wire the pg_cron jobs from docs/02 §007.
6. Admin refund action calling POST /refund, writing to refunds, restoring stock via an
   inventory_movements row.

Write tests U-20..U-28 and P-01..P-13 first, then implement until green. Use the Paystack
test keys and test card 4084084084084081.

Done when every case in docs/04-TEST-PLAN.md §5 passes, including duplicate webhook,
amount mismatch, and lost-webhook reconciliation.
```

## P8 — Orders, email, PDFs

```
Build post-purchase:
- /account/orders list + /account/orders/[orderNumber] detail with status timeline,
  items, payment reference, warranty info, invoice download.
- Server actions for staff status transitions (confirmed → packed → dispatched → delivered),
  each writing audit_log and enqueuing exactly one notification. Guard against duplicate
  sends with a notifications table keyed (order_id, event).
- src/lib/email: Resend + React Email templates — order confirmation, payment receipt,
  dispatch, delivery, refund. GHS amounts, order number, Paystack reference, support contact.
  Honour the email_suppressions table before sending.
- Invoice + receipt PDF generation (server-side, @react-pdf/renderer) stored in the private
  `invoices` bucket; served via short-lived signed URLs.
- Warranty card PDF including captured serials/IMEIs.
- SMS on dispatch and delivery behind a provider interface (Hubtel first, swappable).

Done when: E-10, E-13 pass and each transition sends exactly one email even if the action
is retried.
```

## P9 — Admin

```
Build /admin (staff+ only, guarded by middleware AND RLS):
- Dashboard: today's orders, revenue, low stock (< 3), pending payments, oversold alerts.
- Products: table with search/filter, create/edit product + variants, drag-sort images
  uploaded to the product-images bucket (WebP conversion, 2MB limit), publish toggle,
  spec editor driven by category.spec_schema.
- CSV import/export by SKU: dry-run diff preview, per-row validation, error report download.
- Inventory: adjust stock with a mandatory reason, full inventory_movements history view.
- Orders queue: filter by status, detail view, transition buttons, serial capture at packing,
  packing slip print view, refund action with confirmation.
- Payments/reconciliation: payments vs orders, mismatch flags, Paystack reference deep links.
- Audit log viewer with actor and diff.

Every mutation goes through a Server Action that re-checks is_staff() server-side.

Done when: E-11, E-12, S-10 pass and a customer account gets 404 on every /admin route.
```

## P10 — Hardening

```
Production hardening:
- Rate limits (Upstash Redis) on /api/auth/*, /api/checkout/*, /api/search, webhook endpoint.
- next.config security headers: CSP (allow Paystack + Supabase + Google/Apple auth origins),
  HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Sentry client + server + Edge Functions, with release tagging and PII scrubbing (strip
  email, phone, address from breadcrumbs).
- Alert rules: payment failure rate spike, any order paid > 5 min without status confirmed,
  5xx rate, webhook signature failures.
- error.tsx + not-found.tsx per route group; typed error boundaries around checkout.
- axe-core CI pass on home/PLP/PDP/cart/checkout; fix all critical violations.
- k6 scripts for N-02, N-03, N-04.
- docs/RUNBOOK.md: webhook down, Paystack outage, oversold order, restore from PITR,
  rotate keys, roll back a deploy.

Done when docs/04-TEST-PLAN.md §7 targets are met and the launch checklist in
docs/03-SDLC.md §5 can be ticked line by line.
```

## Reusable prompt fragments

**Review before merge**
```
Review this diff against docs/01-PRD.md and docs/02-DATA-MODEL.md. Flag, in priority order:
client-trusted prices, missing RLS, service_role reachable from the client, float money,
getSession() used for authorization, unvalidated route input, non-idempotent webhook paths,
missing indexes on new query shapes, N+1 queries. Give file:line and a fix for each.
```

**Bug fix**
```
Failing case: <ID from docs/04-TEST-PLAN.md>. Reproduce it with a test first, show the failing
output, explain the root cause in two sentences, then fix it with the smallest change. Do not
alter the test to pass. Confirm the full regression suite (docs/04 §9) is still green.
```

**New migration**
```
Add a migration for <change>. Forward-only and additive. Include the rollback SQL as a comment
at the top. Update src/types/database.ts, any affected RLS policy, and the affected RLS tests.
Confirm `supabase db reset` still succeeds from scratch.
```
