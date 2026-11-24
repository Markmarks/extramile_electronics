# ExtraMile — notes for Claude

Storefront (`apps/web`, Next.js 15) + Tauri back-office (`apps/desktop`, Vite) + shared
`packages/core`. The non-negotiable rules are in README.md — money in integer pesewas,
RLS everywhere, server-only secrets, totals/stock in Postgres RPCs. Read them before
touching pricing, auth, payments or migrations.

## Verify before you commit

- Use the `verify` skill (`.claude/skills/verify/SKILL.md`) for any change to `apps/`,
  `packages/` or `supabase/`. Cheap checks first, then the running app.
- Order: `pnpm verify:preflight` → `pnpm typecheck` → `pnpm test` → `pnpm e2e`.
- Put `Verified: <how>` (or `Verified: none — <reason>`) in every commit message body.
  A commit gate hook (`.claude/hooks/commit-gate.mjs`) checks this; its mode is in
  `.claude/verify-gate.json`.
- A check still failing after three fix rounds → stop and hand it to the user with the
  error, what you tried and your best guess.
- Never make a check pass by weakening it: no `.skip`, sleeps, retries, wider timeouts
  without a cause, or edits to the verify skill / preflight / gate in the same change
  they judge. A truly flaky test: find the root cause, or delete it and say why.

## Tests

- `packages/core/tests/properties.test.ts` — fast-check property tests (round-trips,
  invariants, oracles, state-machine walks). Add a property, not just an example, when
  you change money/pricing/msisdn/imei/order-state. Deep soak: `FC_NUM_RUNS=10000`.
  A failure prints `seed`/`path`; replay with `fc.assert(p, { seed, path })`.
- `apps/*/e2e/*.spec.ts` — Playwright, root `playwright.config.ts`, runs in installed
  Edge (`channel: msedge`, same engine as WebView2). Tests tagged `@backend` self-skip
  when Supabase is unreachable; `pnpm e2e:offline` runs only the rest.
- `apps/web/tests/rls` needs a live database (`pnpm --filter @extramile/web test:rls`).

## Gotchas

- Dev servers: use `preview_start` with the names in `.claude/launch.json`
  (web → 3001, desktop → 1420), never Bash.
- Vite binds `localhost` = IPv6 `::1` on this machine. Probe `localhost`, not `127.0.0.1`.
- `pnpm install` prompts before rebuilding `node_modules` → run it as
  `CI=true pnpm install --frozen-lockfile`. Half-broken pnpm links (e.g. vite can't find
  `picomatch`) are caught by `pnpm verify:preflight`.
- "Failed to fetch" on back-office sign-in = Supabase unreachable (project paused), not a
  credentials problem. Preflight says which.
- In `next dev` the storefront falls back to a demo catalogue (`src/lib/catalog/demo.ts`)
  when Supabase is down. Demo items (`demo-*` ids) can't be added to the bag.
- Desktop `?preview` renders the signed-in shell in a plain browser without the PIN vault
  (dev only). OS keychain / PIN vault / offline sync can only be checked in the Tauri build.
- Back-office page blank with `504 (Outdated Optimize Dep)` in the console = a desktop dev
  server that was running across a `pnpm add`/`install`. Stop it, delete
  `apps/desktop/node_modules/.vite`, start again. Not an app bug.
- Playwright 1.65 needs Node ≥ 22.
- There is no seeded staff account. Never type the user's real credentials — ask them to
  sign in themselves.
