---
name: verify
description: Smoke-test ExtraMile end to end before committing — run the preflight checks, boot the storefront (web, Next.js) and/or back-office (desktop, Vite/Tauri) dev servers, drive the key user flows in the built-in browser, and report PASS/FAIL with a screenshot as evidence. Use after any change to apps/web, apps/desktop, packages/*, or supabase/, and whenever the user says "verify", "smoke test", or "does it still work".
---

# Verify ExtraMile end to end

Goal: prove the change works in the **running app**, not just that it type-checks. Finish
with a short report: each flow PASS / FAIL / BLOCKED, one screenshot per app, and the exact
error for anything that did not pass.

## 0. Pick what to verify

Look at the diff (`git diff --stat` plus staged changes):

| Changed path | Verify |
|---|---|
| `apps/web/**` | web |
| `apps/desktop/**` | desktop |
| `packages/core/**`, `packages/ui/**` | web **and** desktop |
| `supabase/**` | web and desktop, plus `pnpm --filter @extramile/web test:rls` |
| docs / config only | preflight only |

## 1. Cheap checks first (stop on failure)

Run these from the repo root, in this order. Do not start a browser until they pass.

```bash
node scripts/verify-preflight.mjs            # or: ... web | ... desktop
pnpm typecheck
pnpm test        # includes fast-check property tests in packages/core
pnpm e2e         # Playwright, both apps; @backend tests self-skip if Supabase is down
```

`pnpm e2e` covers the scripted flows in step 3 (`apps/web/e2e`, `apps/desktop/e2e`).
Still do the browser-pane walk-through in step 3 for the area you changed: the specs
only assert what someone thought to write down.

Preflight failures and what to do:

- **`<runtime> deps` FAIL** — broken pnpm links (e.g. vite can't import `picomatch`).
  Run `CI=true pnpm install --frozen-lockfile` (the `CI=true` skips pnpm's interactive
  "remove modules dirs?" prompt), then rerun preflight.
- **`env vars` FAIL** — the `.env` / `.env.local` is missing or still holds placeholders.
  BLOCKED: tell the user which variable; never invent or paste keys.
- **`Supabase reachable` FAIL, "does not resolve"** — the hosted project is paused or
  deleted (sign-in will show "Failed to fetch"). BLOCKED on the backend: tell the user to
  restore it in the Supabase dashboard. You can still do the **backend-free** checks below.
- **`port` WARN** — a dev server is already up; `preview_start` reuses it. Fine.

## 2. Boot the apps

Use `preview_start` with the names in `.claude/launch.json` — never start servers via Bash.

- web → `preview_start {name: "web"}` → http://localhost:3001
- desktop → `preview_start {name: "desktop"}` → http://localhost:1420

After loading each page, check `read_console_messages {onlyErrors: true}` and
`preview_logs {level: "error"}`. A blank page with a spinner for a few seconds is normal
for the desktop app; take another screenshot before calling it a failure. A blank page
with `504 (Outdated Optimize Dep)` in the console means the dev server outlived a
`pnpm add`/`install`: `preview_stop` it, delete `apps/desktop/node_modules/.vite`, start
again. That is environment, not a FAIL.

## 3. Drive the flows

Prefer `read_page` / `find` / `get_page_text` for assertions; use screenshots as evidence.

### Storefront (web, needs Supabase)

1. **Home** `/` — renders the "Browse" and "Top rated" sections with at least one product
   card; no error boundary text.
2. **Product** — open a product card → `/p/<slug>` shows name, price (GH₵), condition, and
   an add-to-bag control.
3. **Bag** — add the product → `/cart` lists it under "Bag" with a non-zero "Subtotal".
4. **Checkout** — `/checkout` renders the "Checkout" form with delivery zones and a quote.
   Do **not** submit a real payment. Paystack may only be exercised with a `pk_test_`
   key and Paystack's published test cards; if the key is not `pk_test_`, stop at the form.
5. **Search** — `/search?q=<word from a product name>` returns that product.

### Back-office (desktop, in a plain browser)

1. **Backend-free shell check** (works even when Supabase is down): open
   `http://localhost:1420/?preview`. The signed-in shell must render with the sidebar
   (Dashboard, Orders, Catalogue, Inventory, Users) and every nav item must switch views
   without a console error. Data panels may be empty or show a fetch error — that is
   expected here and is not a failure of this check.
2. **Enrollment screen** — `http://localhost:1420/` shows "Set up this device" with Email,
   Password, New PIN, Confirm PIN and "Bind device & set PIN".
3. **Signed-in flows** (needs Supabase **and** a staff/admin account): there is no seeded
   test account in this repo, so **never type the user's real email/password**. Ask the
   user to sign in themselves in the browser pane, then continue: Orders list loads,
   Catalogue opens a product, Inventory shows stock counts.

Tauri-only behaviour (OS keychain, PIN vault, offline sync to disk) cannot be exercised in
the browser; say so in the report rather than claiming it was verified.

## 4. Fix loop and when to stop

- On FAIL: read the source, fix the cause, rerun from step 1. Never weaken a check, add
  sleeps/retries, or edit this skill or `scripts/verify-preflight.mjs` to make a run pass.
- After **three** fix rounds that still fail, stop and hand it to the user with the error,
  what you tried, and your best guess.
- BLOCKED (backend down, missing env, needs the user's sign-in) is not a FAIL: report it,
  run whatever backend-free checks remain, and do not try to work around it.

## 5. Report

```
VERIFY  web: PASS (5/5 flows)   desktop: BLOCKED (shell PASS; sign-in needs Supabase)
preflight: 7 PASS, 1 FAIL — efwx….supabase.co does not resolve
evidence: <screenshot per app>
not covered: Tauri keychain/PIN vault, real payments
```

Put the same one-line summary in the commit message body as `Verified: <summary>` (or
`Verified: none — <reason>`), so unverified commits are easy to find later.
