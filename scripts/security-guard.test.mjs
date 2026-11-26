// Tests for scripts/security-guard.mjs: a clean minimal repo passes, and one planted
// violation per check is caught. Run: node --test scripts/
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const guard = join(dirname(fileURLToPath(import.meta.url)), 'security-guard.mjs');

const CSP =
  "default-src 'self'; connect-src 'self' https://*.supabase.co; script-src 'self'; style-src 'self'";
const clean = {
  'apps/web/src/lib/supabase/admin.ts':
    "import 'server-only';\nexport const createAdminClient = () => null;\n",
  'apps/web/src/lib/cart/actions.ts':
    "'use server';\nexport async function add(id: string) { return schema.safeParse(id); }\n",
  'apps/web/src/app/api/health/route.ts':
    '// security-guard: no-input — liveness probe.\nexport async function GET() { return 1; }\n',
  'apps/web/next.config.mjs': 'const s = ["\'self\'"];\nif (isDev) s.push("\'unsafe-eval\'");\n',
  'apps/desktop/src/lib/orders.ts': "export const q = (s) => s.from('orders').select('id');\n",
  'apps/desktop/src-tauri/tauri.conf.json': JSON.stringify({
    app: { withGlobalTauri: false, security: { csp: CSP, devCsp: `${CSP} http://localhost:3001` } },
  }),
  'apps/desktop/src-tauri/capabilities/default.json': JSON.stringify({
    permissions: ['core:default'],
  }),
  'apps/desktop/src-tauri/src/lib.rs': 'tauri::generate_handler![pin_unlock, offline::cache_query]',
  'docs/08-SECURITY.md':
    '| Command | x |\n|---|---|\n| `pin_unlock` | pin |\n| `cache_query` | sql |\n',
};

/** Each case: the files to overlay on the clean repo, and the check that must fire. */
const plants = {
  'G-01': { 'apps/web/src/lib/a.ts': 'await supabase.auth.getSession();\n' },
  'G-02': { 'apps/web/src/lib/a.ts': 'process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY;\n' },
  'G-03': {
    'apps/web/src/components/a.tsx': "'use client';\nimport x from '@/lib/supabase/admin';\n",
  },
  'G-04': {
    'apps/desktop/src/lib/a.ts': "s.from('orders').update({ status: 'x' }).eq('id', 1);\n",
  },
  'G-05': {
    'apps/web/src/lib/a.ts': "'use server';\nexport async function f(id: string) { return id; }\n",
  },
  'G-06': {
    'apps/web/src/app/api/a/route.ts': 'export async function POST(r) { return r.json(); }\n',
  },
  'G-07': { 'packages/core/src/a.ts': 'export const p = (s) => parseFloat(s);\n' },
  'G-08': { 'apps/web/next.config.mjs': 'const s = ["\'unsafe-eval\'"];\n' },
  'G-10': {
    'apps/desktop/src-tauri/tauri.conf.json': JSON.stringify({
      app: { security: { csp: `${CSP} http://localhost:3001` } },
    }),
  },
  'G-11': {
    'apps/desktop/src-tauri/tauri.conf.json': JSON.stringify({
      app: { withGlobalTauri: true, security: { csp: CSP } },
    }),
  },
  'G-12': {
    'apps/desktop/src-tauri/capabilities/default.json': JSON.stringify({
      permissions: ['core:default', 'shell:allow-execute'],
    }),
  },
  'G-13': {
    'apps/desktop/src-tauri/src/lib.rs': 'tauri::generate_handler![pin_unlock, cache_query, evil]',
  },
};

function run(overlay = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  try {
    for (const [path, text] of Object.entries({ ...clean, ...overlay })) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return spawnSync(process.execPath, [guard], { cwd: dir, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a clean repo passes', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
});

for (const [id, overlay] of Object.entries(plants)) {
  test(`${id} catches its planted violation`, () => {
    const r = run(overlay);
    assert.equal(r.status, 1, `expected a finding\n${r.stdout}`);
    assert.match(r.stderr, new RegExp(`\\s${id}\\s`));
  });
}

test('comments and opt-outs do not trigger findings', () => {
  const r = run({
    'apps/web/src/lib/b.ts': '// never call auth.getSession() here\n/* parseFloat( */\n',
    'apps/web/src/lib/c.ts':
      "'use server';\n// security-guard: no-input — fixed demo data.\nexport async function f(x: string) { return 1; }\n",
  });
  assert.equal(r.status, 0, r.stderr);
});
