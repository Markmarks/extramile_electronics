---
name: security
description: Vulnerability-test ExtraMile (storefront + back-office) — run the security guard, dependency audits and the security regression tests, probe the area you changed for abuse cases, and log findings against docs/08-SECURITY.md. Use after any change to auth, payments, checkout/pricing, server actions or API routes, migrations/RLS, Edge Functions, Tauri commands or tauri.conf/capabilities; before a back-office release; and whenever the user says "security", "vulnerability", "pentest", "audit" or "is this safe".
---

# Vulnerability testing for ExtraMile

The threat model, test IDs and findings log live in `docs/08-SECURITY.md`. Read §1 (rules
of engagement) before probing anything. This skill complements `verify`: run both before
committing a change in the areas above.

## 0. Rules of engagement (never break these)

- Probe only `localhost`, PGlite (`tests/db`), the local Supabase stack, or a `staging.*` /
  `preview.*` host the user named. **Never** active-scan `www.dnvmart.com` or the live
  Supabase project.
- Paystack test mode only. Never a live key or a real card.
- Don't scan third parties (Supabase, Paystack, Google, Apple). Test how we use them.
- No real credentials. There's no seeded staff account, so ask the user to sign in themselves.
- Findings stay private. The repo is **public**, so a new, unfixed vulnerability never goes
  into a commit message, PR title, issue or docs before its fix lands. Tell the user and
  suggest a draft GitHub security advisory.

## 1. Cheap checks first (stop on failure)

```bash
pnpm security          # guard G-01..G-13 + its self-test
pnpm security:audit    # pnpm audit (high+) and cargo audit
pnpm test              # includes tests/db, sanitizeNext property test, core properties
cd apps/desktop/src-tauri && cargo test --lib   # D-05/D-06 IPC tests (back-office changes)
```

Guard finding → fix the code. Never add a `security-guard: no-input` opt-out to code that
reads input, and never loosen `scripts/security-guard.mjs` in the change it judges.
A new Tauri command → add its row to the IPC inventory (docs/08 §5) with the abuse you considered.

## 2. Abuse-case pass on what you changed

Pick the rows of docs/08 §4 that the diff touches, then try to break them as the attacker in §3 would:

| Changed | Try |
|---|---|
| Server action / API route | Call it directly with wrong types, huge strings, other users' ids, no session; check Zod rejects before any DB call |
| Checkout / pricing / coupons | Send prices, negative or huge qty, stacked coupons; total must come from the RPC |
| Auth / redirects | `next=` with `//`, `/\`, `/%09/`, `/%0a/`, `https:`; must stay on our origin |
| RLS / migration | Add a `tests/db` case as anon, customer A vs B, staff; never only the happy path |
| Paystack webhook | Bad signature, replayed event id, amount mismatch, unknown reference |
| Tauri command / config | Call it as a hostile script would (any args); reserved keys, write SQL, path tricks; G-10..G-13 must still pass |
| Rendering user text (reviews, names) | `<img src=x onerror=alert(1)>`, `javascript:` links; no `dangerouslySetInnerHTML` |

Every confirmed issue gets a regression test named with its ID (next free `V-`/`D-` number)
**in the same change as the fix**. Use a fast-check property where the input space is large.

## 3. Severity and reporting

- **High:** money, another customer's data, staff takeover, secrets, or code execution.
  Stop and tell the user before continuing other work.
- **Medium:** needs a precondition (XSS in the webview, local access) or limited impact.
- **Low:** hardening or defence in depth.

Report like this:

```
SECURITY  guard: PASS (12)  audit: 0 high  tests: PASS
findings: V-13 Medium — <one line>, fixed + test   |   none
not covered: <e.g. Tauri keychain on a real PC, live webhook delivery>
```

After the fix lands, add the finding to docs/08 §7. Put `Security: <summary>` next to
`Verified:` in the commit body.
