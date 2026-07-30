# PRD — Electronics Ecommerce Webapp

**Doc owner:** Dee · **Status:** v1.0 draft · **Date:** 2026-07-29
**Stack:** Next.js 15 (App Router, TS) · Supabase (Postgres/Auth/Storage/Edge Functions) · Paystack · Vercel · Resend

---

## 1. Problem & Goal

Ghanaian electronics buyers can't verify authenticity, warranty terms, or real stock before paying. Existing local stores run on WhatsApp + Instagram DMs: no stock truth, no order history, no receipts.

**Goal:** a self-service storefront where a customer finds a specific SKU (with real specs), pays by mobile money or card, and receives a tracked order with a warranty record — without a human in the loop.

**Non-goal (v1):** marketplace/multi-vendor, international shipping, BNPL/instalments, trade-in.

## 2. Success Metrics

| Metric | Target (90 days post-launch) |
|---|---|
| Checkout completion (cart → paid) | ≥ 45% |
| Payment success rate (initialized → success) | ≥ 85% |
| p75 LCP, mobile 4G | ≤ 2.5s |
| Search → PDP click-through | ≥ 30% |
| Order fulfilment error rate (wrong item/qty) | < 1% |
| Failed-webhook / unfulfilled-paid-order count | 0 |

## 3. Users

| Persona | Need | Key screens |
|---|---|---|
| Guest buyer (60% traffic, mobile) | Compare 2–3 phones, pay fast, no signup | Search, PDP, Cart, Guest checkout |
| Returning buyer | Reorder, track, warranty lookup | Account, Orders, Order detail |
| Store admin | Publish SKUs, fix prices, fulfil orders | Admin: products, orders, inventory |
| Finance/owner | Reconcile Paystack vs orders | Admin: payments, payouts, reports |

## 4. Scope — v1 Features

### 4.1 Catalogue
- Nested categories (Phones > Smartphones > Android), brands, product → variants (colour / storage / RAM).
- **Specs as structured JSONB** per category schema (e.g. `{display_in: 6.7, chipset: "…", battery_mah: 5000}`) — renders a spec table and powers facets.
- Variant-level: SKU, price, compare-at price, stock, weight, images.
- Warranty months + warranty provider per product; condition enum (`new`, `open_box`, `refurbished`).
- Related products, "frequently bought with" (manual v1).

### 4.2 Discovery
- Postgres full-text search (tsvector on title+brand+model+specs) + `pg_trgm` fuzzy for typos ("iphon 15").
- Facets: category, brand, price range, in-stock, condition, key spec (storage/RAM).
- Sort: relevance, price asc/desc, newest, rating.
- Sub-200ms search response; debounced autocomplete.

### 4.3 Cart
- Guest cart keyed by httpOnly `cart_token` cookie; merges into user cart on sign-in (sum quantities, cap at stock).
- Server-side revalidation on every mutation and at checkout: price, stock, active flag.
- Stale-price banner if a line item's price changed since it was added.

### 4.4 Checkout
1. Contact (email + phone, MSISDN validated `+233`)
2. Delivery — saved address or new; zone-based fee (Accra Central / Greater Accra / Other Region / Pickup)
3. Review — server-computed totals only
4. Pay — Paystack (mobile money, card, bank transfer, USSD)

Rules:
- **Client never sends prices.** Server recomputes from DB, writes `orders` + `order_items` snapshot, then initializes Paystack with that amount.
- Order created as `pending` / `payment_status=unpaid` before redirect.
- Stock **reserved** for 15 min at order creation; released by cron if unpaid.
- Coupons: percent / fixed / free-shipping, min-spend, per-user and global usage caps.

### 4.5 Payments (Paystack)
- `POST /transaction/initialize` → `authorization_url`, amount in **pesewas**, `currency: "GHS"`, idempotent `reference` = order number.
- Webhook `charge.success` → verify HMAC SHA512 (`x-paystack-signature`) → **then** call `GET /transaction/verify/:reference` → assert `status=success`, `amount ==` order total, `currency == GHS` → fulfil.
- Callback page polls `orders.payment_status` (never trusts query params).
- Idempotency: `webhook_events.event_id` unique; replays are no-ops.
- Refunds: admin-triggered `POST /refund`, tracked in `refunds`.

### 4.6 Orders & Fulfilment
- States: `pending → confirmed → packed → dispatched → delivered`; terminal `cancelled`, `refunded`.
- Serial/IMEI capture per unit at packing → stored on `order_items.serials[]` → printed on warranty card.
- Customer-visible timeline + email/SMS on each transition.
- Invoice + receipt PDF (GHS, VAT/NHIL/GETFund lines, Paystack reference).

### 4.7 Accounts & Auth
- Email OTP/magic-link, email+password, **Google OAuth**, **Apple OAuth** (see `05-OAUTH.md`).
- Guest checkout with post-purchase account claim (same email → link orders).
- Roles: `customer`, `staff`, `admin` in `profiles.role`, enforced by RLS + middleware.

### 4.8 Admin
Primary staff console is the **Tauri Windows desktop app** (`07-DESKTOP-ADMIN.md`). Web `/admin` is trimmed to a read-only ops dashboard plus order status transitions for off-site use.
- Product/variant CRUD with image upload (Supabase Storage, signed URLs, WebP transform).
- CSV bulk import/update by SKU.
- Inventory adjustments with reason + full `inventory_movements` audit trail.
- Order queue, status transitions, refunds, packing slips.
- Reconciliation view: Paystack settlements vs `payments` rows; flags mismatches.
- Every mutation written to `audit_log` with actor.

### 4.9 Notifications
Resend transactional: order confirmation, payment receipt, dispatch, delivery, refund. SMS (Hubtel/Arkesel) for dispatch + delivery only.

## 5. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | PDP p75 LCP ≤ 2.5s on 4G; ISR/edge cache catalogue; images ≤ 120KB AVIF/WebP |
| Availability | 99.9% storefront; checkout degrades to "order & pay by MoMo prompt" if Paystack init fails |
| Security | RLS on every table, no service_role key client-side, CSP, rate limits on auth/checkout/search, secrets in Vercel/Supabase env only |
| Data | Money as `bigint` pesewas — **never float**; `timestamptz` UTC everywhere; PITR backups on |
| Compliance | Ghana Data Protection Act 2012 — privacy policy, consent log, data-export/delete endpoint; PCI SAQ-A (Paystack-hosted, no card data touches us) |
| Accessibility | WCAG 2.1 AA; keyboard checkout; ≥4.5:1 contrast |
| SEO | SSR product pages, `Product`/`Offer`/`BreadcrumbList` JSON-LD, sitemap, canonical per variant |
| Observability | Sentry (client+server), structured logs on all payment paths, alert on any paid-but-unfulfilled order > 5 min |

## 6. Key Flows

**Purchase (happy):** search → PDP → add to cart → checkout → order `pending` + stock reserved → Paystack → webhook verified → `confirmed`, stock committed, receipt emailed → admin packs → dispatched → delivered.

**Payment abandoned:** order stays `pending`; cron releases reservation at T+15m; recovery email at T+1h with resume link (same order, new reference).

**Webhook lost:** cron re-verifies every `pending` order older than 10 min with a Paystack reference; fulfils if success. Guarantees the metric "0 paid-but-unfulfilled".

**Overselling race:** stock decrement is inside an RPC with `WHERE stock >= qty`; 0 rows → order flagged `oversold`, auto-refund initiated, customer emailed.

## 7. Out of Scope (v2 backlog)
Multi-vendor, product Q&A, live chat, instalments, loyalty points, warehouse barcode scanning, WhatsApp order bot, comparison table builder, Telecel/AirtelTigo direct MoMo (Paystack covers v1).

## 8. Open Decisions
1. SMS provider — Hubtel vs Arkesel (cost per SMS at volume).
2. VAT registration status → whether tax lines are shown or absorbed.
3. Pickup location(s) at launch.
4. Refurbished grading scale (A/B/C) definitions — needs merchandising input.
