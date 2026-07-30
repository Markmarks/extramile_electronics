# SDLC — Electronics Ecommerce Webapp

Model: **iterative-incremental with hard release gates.** Two-week sprints, trunk-based branching, every merge deployable.

## 1. Environments

| Env | Supabase project | Paystack | Host | Data |
|---|---|---|---|---|
| local | `supabase start` (Docker) | test keys | localhost:3000 | seeded |
| preview | `store-staging` | test keys | Vercel preview per PR | seeded, resettable |
| production | `store-prod` | live keys | Vercel prod, custom domain | real, PITR on |

Rules: one Supabase project per env — never share. Migrations only via `supabase/migrations/*.sql` in git; **no changes through the dashboard**. Secrets in Vercel env + Supabase Function secrets; `SUPABASE_SERVICE_ROLE_KEY` and `PAYSTACK_SECRET_KEY` are server-only and never prefixed `NEXT_PUBLIC_`.

## 2. Phases & Gates

### Phase 0 — Foundation (Sprint 0, 1 wk)
Repo, Next.js + TS strict, Tailwind + shadcn, ESLint/Prettier, Husky pre-commit, Vitest + Playwright, Supabase CLI linked, CI pipeline, Sentry, design tokens.
**Gate:** CI green on empty test suite; preview deploy live; `supabase db reset` reproduces schema from scratch.

### Phase 1 — Data & Auth (Sprint 1)
Migrations 001–007, seed script (30 real SKUs across 5 categories), RLS policies, Google + Apple OAuth, profile trigger, middleware session refresh, role guard.
**Gate:** RLS test suite passes (see `04-TEST-PLAN.md` §4) — a signed-in user provably cannot read another user's order. Blocking.

### Phase 2 — Catalogue & Discovery (Sprint 2)
PLP with facets, PDP with variant selector + spec table, FTS + trigram search RPC, autocomplete, ISR caching, JSON-LD, sitemap.
**Gate:** Lighthouse mobile ≥ 90 perf / 100 SEO on PDP; search p95 < 200ms at 10k products.

### Phase 3 — Cart & Checkout (Sprint 3)
Guest cart cookie, cart merge on login, address book, zone fees, coupon validation, `create_order` RPC wired, review step.
**Gate:** server-side price tamper test fails closed (T-SEC-03); stock reservation released by cron.

### Phase 4 — Payments (Sprint 4) — highest risk
Paystack initialize route, hosted checkout redirect, callback polling page, webhook Edge Function (HMAC + verify + `commit_paid_order`), `webhook_events` idempotency, reconciliation cron, refund path.
**Gate:** all of `04-TEST-PLAN.md` §5 passes, including duplicate webhook, amount mismatch, and lost-webhook reconciliation. Blocking.

### Phase 5 — Orders & Notifications (Sprint 5)
Order history, order detail timeline, invoice/receipt PDF, serial capture, Resend templates, SMS on dispatch/delivery.
**Gate:** every status transition sends exactly one email; no duplicates on retry.

### Phase 6 — Admin (Sprint 6)
Product/variant CRUD, image upload, CSV import, inventory adjustments, order queue, refunds, reconciliation view, audit log.
**Gate:** non-staff account gets 404 on every `/admin` route (middleware + RLS, both layers tested).

### Phase 7 — Hardening (Sprint 7)
Rate limiting (Upstash), CSP + security headers, error boundaries, empty/loading states, a11y pass, load test, Sentry alert rules, runbooks, backup restore drill.
**Gate:** OWASP checklist signed off; k6 load test at 200 concurrent holds p95 < 800ms; restore-from-backup rehearsed once.

### Phase 8 — Launch (Sprint 8)
Live Paystack keys, domain + DNS, real catalogue load, staff training, soft launch to 20 invited customers, then public.
**Gate:** launch checklist §5 below fully ticked.

## 3. Branching & CI/CD

```
main ──────────●────────●──────────●───  (auto-deploy prod)
      feat/pdp ┘   fix/webhook ┘
```
- Branch names: `feat/…`, `fix/…`, `chore/…`; max life 3 days.
- PR requires: 1 review, CI green, preview deploy, migration listed in the description if schema changed.
- Conventional Commits → auto changelog.

**CI pipeline (GitHub Actions, on PR):**
1. `pnpm install --frozen-lockfile`
2. `tsc --noEmit`
3. `eslint . --max-warnings 0`
4. `vitest run --coverage` (fail < 70% on `lib/**`, < 90% on `lib/pricing`, `lib/paystack`)
5. `supabase db reset && supabase db lint` on ephemeral instance
6. RLS test suite (pgTAP or Vitest against local Supabase)
7. `playwright test` against preview URL
8. `pnpm build` + bundle-size budget check

**CD:** merge to `main` → migrations applied via `supabase db push` in a deploy job → Vercel prod build → Sentry release + sourcemaps → smoke test hits `/api/health`, PDP, and a test Paystack init. Failed smoke test = automatic Vercel rollback.

**Migration discipline:** forward-only, additive first. Column drops ship one release after code stops reading them. Every destructive migration has a written rollback in the PR.

## 4. Roles & Ceremonies
Solo/small team: Dee = product + eng lead. Weekly: Mon planning (30m), Fri demo + retro (30m). Daily async standup in Slack. Bug triage: P0 payment/auth (fix now, hotfix branch off `main`), P1 checkout-blocking (same sprint), P2 (backlog).

## 5. Launch Checklist
- [ ] Live Paystack keys in prod env only; webhook URL registered in Paystack dashboard; Paystack IPs allow-listed (52.31.139.75, 52.49.173.169, 52.214.14.220)
- [ ] `service_role` key absent from client bundle (`grep` build output)
- [ ] RLS verified enabled on all tables: `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity;` returns 0 rows
- [ ] PITR enabled; backup restore rehearsed
- [ ] Google/Apple OAuth redirect URIs contain the prod domain only (staging removed from prod client)
- [ ] Resend domain verified (SPF/DKIM/DMARC); suppression handling live
- [ ] Sentry alerts: payment failure spike, paid-but-unfulfilled > 5 min, 5xx rate
- [ ] `robots.txt`, sitemap submitted; analytics + consent banner live
- [ ] Privacy policy, terms, returns/warranty policy published (Ghana DPA 2012)
- [ ] Rate limits on `/api/auth/*`, `/api/checkout/*`, `/api/search`
- [ ] Staff trained on order queue + refund flow; runbook printed
- [ ] Rollback plan documented and tested

## 6. Post-Launch
Week 1: daily reconciliation of Paystack settlements vs `payments`. Week 2–4: funnel review, search-zero-result log → catalogue gaps. Monthly: dependency + Supabase upgrade window, restore drill, access review.
