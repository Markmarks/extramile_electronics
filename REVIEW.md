# Review instructions — ExtraMile

Read from the default branch, never from the PR under review. Changes to this file,
`.claude/skills/verify/`, `scripts/verify-preflight.mjs`, `.claude/hooks/` or
`playwright.config.ts` must land in their own PR, never alongside the code they judge.

## What "Important" means here

Reserve **Important** for: wrong money, leaked secrets, broken auth/RLS, lost or
double-processed orders/payments, data loss, or a broken primary user flow. Everything
stylistic is a **Nit** at most. Report at most five Nits. Tag bugs that predate the
change as **Pre-existing**.

## Reliability checklist (check only the items whose trigger matches the diff)

| Trigger in the diff | Check |
|---|---|
| Arithmetic on prices, totals, discounts, shipping | Integer pesewas only; no `/ 100` except for display; `Math.floor` parity with Postgres integer division; a property test in `packages/core/tests/properties.test.ts` covers the new rule. |
| `computeTotals`, coupons, `create_order` RPC | TS mirror and SQL RPC still agree; total never negative; discount never exceeds subtotal. |
| `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, any new env var | Not `NEXT_PUBLIC_`/`VITE_`; not imported into a Client Component or `apps/desktop`. |
| `getSession(` on the server | Must be `getUser()` for authorization. |
| New table or migration | RLS enabled with explicit policies; change is a new file in `supabase/migrations/`; `scripts/check-rls.sql` still passes. |
| Paystack webhook handler | HMAC SHA512 over the raw body, then `/transaction/verify/:reference`; idempotent on event id. |
| `order_status` enum, `order-state.ts`, `orders_guard_status` | `order_transition_allowed()` matches the TS table (`tests/db` asserts it); terminal states stay terminal; status writes go through server code with an expected-`from` check. |
| `update(...)` on `orders` / `order_items` from a client | Not allowed for status; serial writes check that a row changed (RLS refusals return no error). |
| Phone numbers / `normalizeMsisdn` | Output matches `^\+233[1-9]\d{8}$` (DB check constraint); bare 9-digit input that starts with `233` stays a national number. |
| Desktop auth, PIN vault, keychain, `AuthProvider` | Access token never persisted to disk; errors shown to the user (no silent hang); still works offline-locked. |
| Route handlers / server actions taking input | Zod-validated. |
| New `@backend` E2E test | Self-skips via `supabaseUp()` when the backend is down; never submits a real payment. |

## Do not report

- Anything `pnpm lint`, `pnpm typecheck` or Prettier already enforces.
- Generated `packages/core/src/db/database.types.ts`.
- Demo catalogue content in `apps/web/src/lib/catalog/demo.ts`.
