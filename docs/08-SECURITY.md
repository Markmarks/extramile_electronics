# 08 — Security: threat model and vulnerability testing

How ExtraMile finds vulnerabilities before attackers do, for the storefront (`apps/web`)
and the back-office (`apps/desktop`). Every threat below maps to a control and a test; a
threat with no test is a known gap, listed in §7.

Test IDs: `S-` RLS / secrets (docs/04 §4), `V-` storefront, `D-` back-office, `G-` static
guard (`scripts/security-guard.mjs`), `A-` dependency audit.

## 1. Rules of engagement

- **Targets:** only `localhost`, the in-process PGlite DB, the local Supabase stack
  (`supabase start`) or a host named `staging.*` / `preview.*`. **Never production**
  (`www.dnvmart.com`, the live Supabase project) with active scans, fuzzers or load.
- **Payments:** Paystack test mode only (`pk_test_` / `sk_test_` and Paystack's published
  test cards). Never a live key, never a real card.
- **Third parties:** don't scan Supabase's, Paystack's, Google's or Apple's infrastructure.
  Test our use of them (signatures, redirects, RLS), not their servers.
- **Accounts:** no seeded staff account exists. Tests create throwaway users in the local
  stack; nobody types a real person's credentials.
- **Findings** are private: a GitHub *security advisory* on the repo (Security → Advisories
  → New draft), not a public issue or PR title. The fix lands with a regression test that
  carries the finding's ID.

## 2. What we protect

| Asset | Where it lives | Worst case |
|---|---|---|
| Money: prices, totals, refunds | Postgres RPCs, Paystack | Underpaid orders, fraudulent refunds |
| Customer PII: name, phone, address, email | `profiles`, `addresses`, `orders` | Data leak (Ghana Data Protection Act 2012) |
| Staff/admin sessions | Storefront cookies; back-office PIN vault in Windows Credential Manager | Full catalogue/order/refund control |
| Server secrets: `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY` | Vercel/Netlify env, Edge Function secrets | Bypass of every RLS policy |
| Stock & order state | `inventory`, `orders` + `orders_guard_status` trigger | Overselling, skipped payment |
| Update channel | Tauri updater (minisign key), Authenticode | Malicious back-office build on the shop PC |

## 3. Who attacks, and how

| Attacker | Reaches | Typical moves |
|---|---|---|
| Anonymous visitor / bot | Storefront, public API routes, server actions, Supabase REST with the anon key | Price/qty tampering, forged webhooks, enumeration, open redirect, XSS via reviews, scraping |
| Signed-in customer | The above + own rows | IDOR on other customers' orders/addresses, role escalation, review abuse |
| Phisher | Customers' inboxes | Links on our domain that bounce to a fake login (open redirect) |
| Malware or another user on the shop PC | Back-office process, Credential Manager, `offline.sqlite3` | Steal the sealed session, brute-force the PIN, tamper with the outbox |
| Script in the back-office webview (XSS, a compromised npm package) | Every registered IPC command | Read secrets, reset the PIN lockout, write the offline DB |
| Supply chain | `pnpm` / `cargo` dependencies, GitHub Actions | Code execution in CI, the build, or the shipped app |

## 4. Trust boundaries → controls → tests

### Storefront (`apps/web`)

| ID | Threat | Control | Test |
|---|---|---|---|
| V-01 | Client sets the price or total | Totals computed in Postgres RPCs; no price in `createOrderSchema` | U-/I- pricing tests, `tests/db`; phase 2 e2e tampering |
| V-02 | Non-staff reaches `/admin` | Middleware 404 **and** RLS on every query (S-10) | `tests/rls` S-10; phase 2: direct-request test without middleware |
| V-03 | Open redirect after sign-in (`next=`) | `sanitizeNext` resolves the URL and requires our origin | `tests/unit/auth.test.ts`, examples + fast-check property |
| V-04 | Unvalidated server-action / route input | Zod on every action and route (README rule 7) | G-05, G-06 |
| V-05 | Forged / replayed Paystack webhook | HMAC-SHA512 over the raw body, `/transaction/verify`, idempotent on event id | P-tests (docs/04 §5); phase 2 forged-signature e2e |
| V-06 | Service-role key in the browser bundle | `server-only` import; no `NEXT_PUBLIC_` secret | S-11 `scan-bundle-secrets.mjs`, G-02, G-03 |
| V-07 | Authorization via unverified session | `getUser()` only on the server | G-01 |
| V-08 | XSS, clickjacking, MIME sniffing | CSP, `frame-ancestors 'none'`, XFO, nosniff, React escaping | G-08; phase 2 header + reflected-input e2e |
| V-09 | Order status skipped or rewound | `orders_guard_status` trigger, no client UPDATE on orders | `tests/db`, G-04 |
| V-10 | Order-status endpoint abuse | Order number regex-validated; returns status enums only | G-06; phase 2 |
| V-11 | Image optimiser used as an open proxy | `remotePatterns` pinned to our bucket | phase 2 e2e |
| V-12 | Known-vulnerable dependency | `pnpm audit --audit-level=high` in CI, Dependabot | A-01 |
| V-13 | Guest order lookup used to read someone else's order, or guest orders claimed by an account that doesn't own the email | `/track` needs order number **and** checkout email (compared server-side, one "not found" message, IP rate limit, progress only — no address/phone/payment ref); `claim_guest_orders` is service-role only and called solely from `/auth/callback` (inbox or provider-verified email), never on a password sign-in | `tests/db/customer-privacy.test.ts` |
| V-14 | Data export / account deletion abused | Export reads only the session user's rows (RLS, no input); delete needs a session, a typed DELETE and a rate limit; `detach_customer` refuses staff/admin and is service-role only | `tests/db/customer-privacy.test.ts` |

### Back-office (`apps/desktop`)

| ID | Threat | Control | Test |
|---|---|---|---|
| D-01 | Privileged secret in the binary | Only URL + anon key compiled in | `scan-bundle-secrets.mjs apps/desktop/dist`, G-03 |
| D-02 | Script injection reaches IPC | Strict production CSP, `withGlobalTauri: false`, only `core:default` | G-10, G-11, G-12 |
| D-03 | New IPC command added without review | Inventory below must list every registered command | G-13 |
| D-04 | Stolen session on the shop PC | Refresh token sealed with AES-256-GCM, key from PIN via Argon2id; 10 wrong PINs wipe the vault | phase 2 |
| D-05 | Webview resets the PIN lockout or reads the vault | Generic `secure_*` commands refuse `pin_vault`, `pin_fail`, `device_id` | `cargo test` `generic_secret_commands_cannot_touch_vault_or_lockout` |
| D-06 | Webview writes the offline DB through `cache_query` | SELECT/WITH prefix, single statement, **and** `sqlite3_stmt_readonly` | `cargo test` `offline::tests::*` |
| D-07 | Offline outbox replays a forbidden write | `ALLOWED_KINDS` in Rust + UI; server dedupes on idempotency key | phase 2 |
| D-08 | Known-vulnerable crate (SQLite, url, …) | `cargo audit` in CI | A-02 |
| D-09 | Malicious update | Minisign-signed updater, Authenticode, draft releases | release checklist (docs/07 §10) |

### Static guard (`node scripts/security-guard.mjs`, `--list` prints them)

G-01 `getSession()` in server code · G-02 secret-named public env vars · G-03 service-role
boundaries · G-04 order writes outside reviewed paths · G-05 server actions parse input ·
G-06 route handlers parse input or declare `security-guard: no-input — <reason>` ·
G-07 float money helpers in pricing code · G-08 storefront CSP dev-only relaxations ·
G-10 back-office production CSP · G-11 Tauri global flags · G-12 capabilities ·
G-13 IPC inventory.

## 5. Back-office IPC inventory

Every command in `tauri::generate_handler!` must have a row here (G-13). Adding a command
means adding a row: what it accepts, and why a hostile script calling it can't do harm.

| Command | Input | Abuse considered |
|---|---|---|
| `secure_set` | key, value | Reserved keys refused (D-05). Not called by the UI today; remove if it stays unused. |
| `secure_get` | key | Reserved keys refused, so the sealed vault can't be exported for offline guessing. |
| `secure_clear` | key | Reserved keys refused, so the lockout counter can't be cleared. |
| `device_id` | — | Random UUID, not secret. |
| `pin_status` | — | Reveals only whether the device is enrolled. |
| `pin_enroll` | pin, refresh token | Overwrites the vault: an attacker could only bind *their own* session. Format-checked. |
| `pin_unlock` | pin | Counted; 10 failures wipe the vault (D-04). |
| `session_reseal` | refresh token | Requires an unlocked session (cached key). |
| `pin_lock` | — | Drops the cached key. Harmless. |
| `pin_reset` | — | Wipes the vault: denial of service only, recovery is re-enrolment. |
| `cache_put` | table, rows | Writes the local cache only; server data is never trusted from it. |
| `cache_query` | sql | Read-only enforced by SQLite (D-06). |
| `outbox_enqueue` | kind, payload, key | `ALLOWED_KINDS` only; server re-authorises every replayed write. |
| `outbox_pending` | — | Reads the local queue. |
| `outbox_mark` | id, ok, error | Local bookkeeping; the server dedupes on the idempotency key. |
| `list_printers` | — | Printer names only. |
| `print_receipt` | receipt DTO, printer | Typed DTO, rendered by us; phase 2: fuzz the DTO fields. |
| `print_label` | label fields, printer | As above. |
| `print_test` | printer | Fixed content. |

## 6. Cadence

| When | What | Where |
|---|---|---|
| Every edit to auth, payments, migrations, server actions/routes or Tauri commands | `node scripts/security-guard.mjs` + the matching unit/db/cargo tests | Claude (`security` skill), lint-staged |
| Every PR | Guard, `pnpm audit --audit-level=high`, `cargo audit`, Semgrep (`p/typescript`, `p/react`, `p/nextjs`, `p/rust`, `p/secrets`), RLS suite, bundle scans | CI `security` job |
| Weekly | Dependabot PRs (npm, cargo, GitHub Actions) | GitHub |
| Phase 2 | `@security` abuse-case e2e for both apps | `pnpm e2e` |
| Phase 3 | ZAP baseline per PR, ZAP full scan + deep fuzzing nightly, local/staging only | CI |
| Before each back-office release | `cargo audit`, guard, D-tests, signed-build check | Release checklist |

## 7. Findings log

Phase 1 (2026-11-25), all fixed in the same change with a regression test or check:

| ID | Severity | Finding | Fix |
|---|---|---|---|
| V-03 | High | `next=/%09/evil.com` redirected customers to evil.com after sign-in (the URL parser drops tabs/newlines, the prefix check didn't) | `sanitizeNext` resolves the URL and checks the origin; property test |
| D-05 | High (needs script in the webview) | `secure_set/clear("pin_fail")` reset the 10-try lockout; `secure_get("pin_vault")` exported the sealed token | Reserved keys refused in Rust |
| D-06 | Medium (needs script in the webview) | `cache_query("WITH x AS (SELECT 1) DELETE FROM outbox")` passed the SELECT-only check | `stmt.readonly()` check |
| D-02 | Low | Production CSP allowed `http://localhost:3001` | Moved to `devCsp` |
| V-04 | Low | `quoteAction`, `advanceOrderAction`, `/api/orders/[n]/status` and the OAuth callback didn't Zod-parse input | Zod schemas; G-05/G-06 keep it that way |
| A-01 | High/critical (dev tooling only) | vitest/tinypool RCE when the UI server runs, vite dev-server file check, brace-expansion/js-yaml DoS | vitest 4.1, vite 6.4.6, pnpm overrides |
| A-02 | Medium | Bundled SQLite CVE (libsqlite3-sys), `url` stack overflow, `cookie` nonce reuse | rusqlite 0.43, `url` 2.5.9, `cookie` 0.18.3 |

Open: hardening owned by phase 2. This repo is public, so open findings with a real
attack path are tracked in private GitHub security advisories, not here, and are added to
the table above once fixed.

- **V-08 storefront `script-src 'unsafe-inline'` in production.** Weakens the CSP as an XSS
  backstop. Move to nonce-based CSP (Next middleware nonces).
- **A-01 moderates:** `minimatch` (via typescript-eslint) and `postcss-selector-parser`
  (via tailwind 3), dev tooling only, below the CI threshold.
- **A-02 warnings:** unmaintained `unic-*`, `proc-macro-error`, `chrono` and unsound `glib`
  and `tokio` advisories come in through Tauri's own tree. Tracked, not actionable here.
