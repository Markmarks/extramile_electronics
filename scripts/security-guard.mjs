#!/usr/bin/env node
/**
 * Security guard — the README's non-negotiable rules and the back-office's Tauri
 * hardening, checked as code. No dependencies; runs locally and in CI.
 *
 *   node scripts/security-guard.mjs          # all checks
 *   node scripts/security-guard.mjs --list   # print the check ids
 *
 * Each check id (G-xx) is listed in docs/08-SECURITY.md with the threat it covers.
 * A finding prints `file:line  G-xx  message`; any finding exits 1.
 *
 * Opt-outs are explicit and reviewable: put `// security-guard: no-input — <reason>`
 * on or just above a server action / route handler that genuinely takes no input.
 * Never add an opt-out (or loosen a check here) in the same change the guard judges.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const findings = [];
const CHECKS = {
  'G-01': 'Server authorization uses auth.getUser(), never auth.getSession() (rule 3)',
  'G-02': 'No public env var (NEXT_PUBLIC_/VITE_) named like a secret (rule 2)',
  'G-03': 'Service-role client stays server-only; never in a Client Component or desktop (rule 2)',
  'G-04': 'Order rows are written only by the reviewed server paths (order-state rule)',
  'G-05': 'Every server action Zod-parses its arguments (rule 7)',
  'G-06': 'Every API route handler Zod-parses its input or declares it takes none (rule 7)',
  'G-07': 'No float money helpers (parseFloat/toFixed) in pricing code (rule 1)',
  'G-08': "Storefront CSP: 'unsafe-eval' and localhost only in dev",
  'G-10': 'Back-office production CSP is strict (no unsafe-eval, wildcards, http: or localhost)',
  'G-11': 'Back-office: withGlobalTauri off, no dangerous* security flags',
  'G-12': 'Back-office capabilities grant only reviewed permissions',
  'G-13': 'Back-office IPC commands match the reviewed inventory in docs/08-SECURITY.md',
};

if (process.argv.includes('--list')) {
  for (const [id, text] of Object.entries(CHECKS)) console.log(`${id}  ${text}`);
  process.exit(0);
}

// ── helpers ─────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'target', 'gen', 'coverage', '.vite']);
function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(p, exts);
    return exts.some((e) => name.endsWith(e)) ? [p] : [];
  });
}
const rel = (p) => relative(root, p).split(sep).join('/');
const read = (p) => readFileSync(p, 'utf8');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
function report(id, file, line, message) {
  findings.push(`${rel(file)}:${line}  ${id}  ${message}`);
}
/** Blank out // and /* *\/ comments (keeping newlines) so matches are code only. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));
}
const isClient = (text) => /^\s*['"]use client['"]/m.test(text);
const OPT_OUT = /security-guard:\s*no-input\s*[—-]+\s*\S/;
const PARSES = /\.(safeParse|parse|parseAsync|safeParseAsync)\(|\bparse[A-Z]\w*\(/;

const TS = ['.ts', '.tsx'];
const webSrc = walk(join(root, 'apps/web/src'), TS);
const desktopSrc = walk(join(root, 'apps/desktop/src'), TS);
const coreSrc = walk(join(root, 'packages/core/src'), TS).filter(
  (f) => !f.includes(`${sep}db${sep}`),
);
const functions = walk(join(root, 'supabase/functions'), TS);

// ── G-01 getSession() for authorization on the server ───────────────────────
for (const file of [...webSrc, ...functions]) {
  const raw = read(file);
  if (isClient(raw)) continue; // a browser reading its own token is not authorization
  const code = stripComments(raw);
  for (const m of code.matchAll(/\.auth\.getSession\s*\(/g)) {
    report('G-01', file, lineOf(code, m.index), 'auth.getSession() in server code — use getUser()');
  }
}

// ── G-02 secret-looking public env vars ─────────────────────────────────────
const envFiles = [
  ...walk(join(root, 'apps'), ['.ts', '.tsx', '.mjs', '.js']),
  ...walk(join(root, 'packages'), ['.ts', '.tsx']),
  ...['apps/web/.env.example', 'apps/desktop/.env.example'].map((p) => join(root, p)),
].filter((f) => existsSync(f));
const PUBLIC_SECRET = /\b(NEXT_PUBLIC|VITE)_\w*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|WEBHOOK)\w*/g;
for (const file of envFiles) {
  const text = read(file);
  for (const m of text.matchAll(PUBLIC_SECRET)) {
    report('G-02', file, lineOf(text, m.index), `${m[0]} would ship to the browser/webview`);
  }
}

// ── G-03 service-role client boundaries ─────────────────────────────────────
const adminModule = join(root, 'apps/web/src/lib/supabase/admin.ts');
if (!existsSync(adminModule) || !/^import ['"]server-only['"]/m.test(read(adminModule))) {
  report('G-03', adminModule, 1, "service-role module must start with import 'server-only'");
}
for (const file of webSrc) {
  const text = read(file);
  if (isClient(text) && /lib\/supabase\/admin|SUPABASE_SERVICE_ROLE_KEY/.test(text)) {
    report('G-03', file, 1, 'Client Component references the service-role client/key');
  }
}
for (const file of desktopSrc) {
  const code = stripComments(read(file));
  for (const m of code.matchAll(/SERVICE_ROLE|service_role|PAYSTACK_SECRET|sk_(live|test)_/g)) {
    report(
      'G-03',
      file,
      lineOf(code, m.index),
      'privileged secret referenced in the desktop webview',
    );
  }
}

// ── G-04 order writes only from reviewed server paths ───────────────────────
// The DB trigger orders_guard_status is the real gate; this keeps new write paths visible.
const ORDER_WRITERS = new Set([
  'apps/web/src/lib/orders/actions.ts', // advanceOrderAction (staff, service role)
  'supabase/functions/admin-actions/index.ts', // order_transition (back-office)
  'supabase/functions/paystack-webhook/index.ts', // payment confirmation
  'supabase/functions/reconcile-payments/index.ts', // scheduled payment reconciliation
]);
for (const file of [...webSrc, ...desktopSrc, ...functions]) {
  const code = stripComments(read(file));
  for (const m of code.matchAll(/\.from\(\s*['"]orders['"]\s*\)/g)) {
    const end = code.indexOf(';', m.index);
    const chain = code.slice(m.index, end === -1 ? undefined : end);
    if (/\.(update|insert|upsert|delete)\s*\(/.test(chain) && !ORDER_WRITERS.has(rel(file))) {
      report(
        'G-04',
        file,
        lineOf(code, m.index),
        'writes orders outside the reviewed server paths',
      );
    }
  }
}

// ── G-05 server actions parse their arguments ───────────────────────────────
for (const file of webSrc) {
  const raw = read(file);
  if (!/^\s*['"]use server['"]/m.test(raw)) continue;
  const code = stripComments(raw);
  const starts = [...code.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g)];
  starts.forEach((m, i) => {
    const body = code.slice(m.index, starts[i + 1]?.index ?? code.length);
    const params = m[2].trim();
    const before = raw.slice(Math.max(0, m.index - 300), m.index);
    if (!params || PARSES.test(body) || OPT_OUT.test(before)) return;
    report(
      'G-05',
      file,
      lineOf(code, m.index),
      `server action ${m[1]}(${params}) does not Zod-parse its input`,
    );
  });
}

// ── G-06 route handlers parse input or say they take none ───────────────────
for (const file of webSrc.filter((f) => /[\\/]route\.ts$/.test(f))) {
  const raw = read(file);
  const code = stripComments(raw);
  if (PARSES.test(code) || OPT_OUT.test(raw)) continue;
  const m = code.match(/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/);
  if (m) {
    report(
      'G-06',
      file,
      lineOf(code, m.index),
      `${m[2]} handler neither Zod-parses input nor declares "security-guard: no-input — <reason>"`,
    );
  }
}

// ── G-07 float money helpers in pricing code ────────────────────────────────
const moneyCode = [
  ...coreSrc,
  ...webSrc.filter((f) => /[\\/]lib[\\/](cart|checkout|paystack|orders)[\\/]/.test(f)),
  ...functions,
];
for (const file of moneyCode) {
  const code = stripComments(read(file));
  for (const m of code.matchAll(/\bparseFloat\s*\(|\.toFixed\s*\(/g)) {
    report(
      'G-07',
      file,
      lineOf(code, m.index),
      'float formatting/parsing in money code — use pesewas helpers',
    );
  }
}

// ── G-08 storefront CSP dev-only relaxations ────────────────────────────────
const nextConfig = join(root, 'apps/web/next.config.mjs');
if (existsSync(nextConfig)) {
  read(nextConfig)
    .split('\n')
    .forEach((line, i) => {
      if (/unsafe-eval|localhost/.test(line) && !/isDev|^\s*\/\//.test(line)) {
        report('G-08', nextConfig, i + 1, "'unsafe-eval'/localhost outside an isDev branch");
      }
    });
}

// ── G-10..G-13 Tauri back-office ────────────────────────────────────────────
const tauriDir = join(root, 'apps/desktop/src-tauri');
const confPath = join(tauriDir, 'tauri.conf.json');
if (existsSync(confPath)) {
  const conf = JSON.parse(read(confPath));
  const sec = conf.app?.security ?? {};

  // G-10 production CSP
  const csp = typeof sec.csp === 'string' ? sec.csp : null;
  if (!csp)
    report('G-10', confPath, 1, 'app.security.csp must be a non-empty string (null disables CSP)');
  else {
    const bad = [
      [/'unsafe-eval'/, "'unsafe-eval'"],
      [/(^|\s)\*(\s|;|$)/, 'bare * source'],
      [/(^|\s)(https?:|wss?:)(\s|;|$)/, 'scheme-only source'],
      [/\bhttp:\/\/(?!ipc\.localhost)/, 'plain http: origin'],
      [/localhost(?!\b)|\/\/localhost|127\.0\.0\.1/, 'localhost (put dev hosts in devCsp)'],
    ];
    for (const [re, what] of bad)
      if (re.test(csp)) report('G-10', confPath, 1, `production csp contains ${what}`);
    if (!/script-src 'self'(;|$)/.test(csp))
      report('G-10', confPath, 1, "csp script-src must be exactly 'self'");
  }

  // G-11 global flags
  if (conf.app?.withGlobalTauri)
    report('G-11', confPath, 1, 'withGlobalTauri exposes the IPC API to every script');
  for (const key of Object.keys(sec)) {
    if (/^dangerous/i.test(key)) report('G-11', confPath, 1, `security.${key} is set`);
  }
  if (sec.freezePrototype === false)
    report('G-11', confPath, 1, 'freezePrototype explicitly disabled');

  // G-12 capabilities
  const ALLOWED_PERMISSIONS = new Set(['core:default']);
  for (const file of walk(join(tauriDir, 'capabilities'), ['.json'])) {
    const cap = JSON.parse(read(file));
    for (const p of cap.permissions ?? []) {
      const id = typeof p === 'string' ? p : p.identifier;
      if (!ALLOWED_PERMISSIONS.has(id)) report('G-12', file, 1, `unreviewed permission "${id}"`);
    }
    if (cap.remote) report('G-12', file, 1, 'capability grants IPC to remote URLs');
  }

  // G-13 IPC inventory: docs/08-SECURITY.md lists every command with its threat notes.
  const lib = read(join(tauriDir, 'src/lib.rs'));
  const handler = lib.match(/generate_handler!\[([\s\S]*?)\]/);
  const registered = (handler?.[1] ?? '')
    .split(',')
    .map((s) => s.trim().split('::').pop())
    .filter(Boolean);
  const docPath = join(root, 'docs/08-SECURITY.md');
  const doc = existsSync(docPath) ? read(docPath) : '';
  const inventory = new Set([...doc.matchAll(/^\|\s*`(\w+)`\s*\|/gm)].map((m) => m[1]));
  for (const cmd of registered) {
    if (!inventory.has(cmd))
      report(
        'G-13',
        join(tauriDir, 'src/lib.rs'),
        1,
        `IPC command ${cmd} is not in docs/08-SECURITY.md's inventory`,
      );
  }
}

// ── result ──────────────────────────────────────────────────────────────────
if (findings.length) {
  console.error(`✗ security-guard: ${findings.length} finding(s)\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`✓ security-guard: ${Object.keys(CHECKS).length} checks passed`);
