#!/usr/bin/env node
/**
 * Fast checks to run before driving the apps end to end (see .claude/skills/verify).
 * Each check prints PASS / WARN / FAIL with a one-line reason; exit code 1 if any FAIL.
 *
 *   node scripts/verify-preflight.mjs            # web + desktop
 *   node scripts/verify-preflight.mjs desktop    # one app
 *
 * Never prints secret values: env vars are reported as set / missing / placeholder only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2] ?? 'all';

const APPS = {
  web: {
    dir: 'apps/web',
    envFile: '.env.local',
    urlVar: 'NEXT_PUBLIC_SUPABASE_URL',
    keyVar: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    runtime: 'next',
    port: 3001,
  },
  desktop: {
    dir: 'apps/desktop',
    envFile: '.env',
    urlVar: 'VITE_SUPABASE_URL',
    keyVar: 'VITE_SUPABASE_ANON_KEY',
    runtime: 'vite',
    port: 1420,
  },
};

let failed = 0;
const report = (status, name, msg) => {
  if (status === 'FAIL') failed++;
  console.log(`${status.padEnd(4)}  ${name.padEnd(28)} ${msg}`);
};

function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const isPlaceholder = (v) => !v || /<[^>]+>|xxx/i.test(v);

/** True when dependency `d` is linked AND its entry file is on disk. A dir that exists
 *  with an empty/half-copied payload (seen with pnpm on Windows) counts as missing. */
function depEntryExists(req, d) {
  if (d.startsWith('@types/')) return true;
  try {
    return existsSync(req.resolve(d));
  } catch (e) {
    if (e.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && e.code !== 'MODULE_NOT_FOUND') return false;
  }
  // ESM-only / exports-only packages: locate the dir via node_modules lookup and check
  // that package.json plus its declared entry exist.
  for (const base of req.resolve.paths(d) ?? []) {
    const dir = join(base, d);
    const pj = join(dir, 'package.json');
    if (!existsSync(pj)) continue;
    const p = JSON.parse(readFileSync(pj, 'utf8'));
    const exp = p.exports?.['.'] ?? p.exports;
    const entry =
      p.module ??
      p.main ??
      (typeof exp === 'string' ? exp : (exp?.import ?? exp?.default ?? exp?.require));
    const file =
      typeof entry === 'string' ? entry : typeof entry?.default === 'string' ? entry.default : null;
    return file ? existsSync(join(dir, file)) || existsSync(join(dir, `${file}.js`)) : true;
  }
  return false;
}

/** Resolve the runtime and every one of its own dependencies from its install dir.
 *  Catches half-broken pnpm links (e.g. vite unable to import picomatch). */
function checkDeps(app, cfg) {
  const req = createRequire(join(root, cfg.dir, 'package.json'));
  let pkgJson;
  try {
    pkgJson = req.resolve(`${cfg.runtime}/package.json`);
  } catch {
    return report('FAIL', `${app}: ${cfg.runtime} installed`, 'not resolvable; run `pnpm install`');
  }
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
  const inner = createRequire(pkgJson);
  const missing = Object.keys(pkg.dependencies ?? {}).filter((d) => !depEntryExists(inner, d));
  if (missing.length)
    report(
      'FAIL',
      `${app}: ${cfg.runtime} deps`,
      `missing ${missing.join(', ')}; run \`CI=true pnpm install --frozen-lockfile\``,
    );
  else
    report(
      'PASS',
      `${app}: ${cfg.runtime} deps`,
      `${cfg.runtime}@${pkg.version} and its deps resolve`,
    );
}

async function checkSupabase(app, env, cfg) {
  const url = env[cfg.urlVar];
  if (isPlaceholder(url))
    return report('FAIL', `${app}: Supabase reachable`, `${cfg.urlVar} unset/placeholder`);
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) {
    try {
      await lookup(host);
    } catch {
      return report(
        'FAIL',
        `${app}: Supabase reachable`,
        `${host} does not resolve (project paused/deleted, or wrong ref) — every sign-in will say "Failed to fetch"`,
      );
    }
  }
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: env[cfg.keyVar] ?? '' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) report('PASS', `${app}: Supabase reachable`, `${host} auth health ${res.status}`);
    else
      report(
        'FAIL',
        `${app}: Supabase reachable`,
        `${host} auth health HTTP ${res.status} (bad anon key, or project still starting)`,
      );
  } catch (e) {
    report('FAIL', `${app}: Supabase reachable`, `${host}: ${e.cause?.code ?? e.message}`);
  }
}

/** In use on either stack? Vite binds localhost = IPv6 ::1 here, Next binds IPv4/dual. */
async function portInUse(port) {
  const probe = (host) =>
    new Promise((done) => {
      const sock = net.connect({ port, host });
      sock.once('connect', () => (sock.destroy(), done(true)));
      sock.once('error', () => done(false));
    });
  return (await probe('127.0.0.1')) || (await probe('::1'));
}

async function checkPort(app, port) {
  if (await portInUse(port))
    report(
      'WARN',
      `${app}: port ${port}`,
      "already in use — fine if it is this app's dev server (preview_start/Playwright reuse it)",
    );
  else report('PASS', `${app}: port ${port}`, 'free');
}

const selected = which === 'all' ? Object.keys(APPS) : [which];
for (const app of selected) {
  const cfg = APPS[app];
  if (!cfg) {
    console.error(`unknown app "${app}" (expected web, desktop or all)`);
    process.exit(2);
  }
  checkDeps(app, cfg);
  const env = parseEnv(join(root, cfg.dir, cfg.envFile));
  if (!env) {
    report(
      'FAIL',
      `${app}: ${cfg.envFile}`,
      `missing; copy ${cfg.dir}/.env.example and fill it in`,
    );
    continue;
  }
  const bad = [cfg.urlVar, cfg.keyVar].filter((k) => isPlaceholder(env[k]));
  if (bad.length)
    report('FAIL', `${app}: env vars`, `${bad.join(', ')} unset or placeholder in ${cfg.envFile}`);
  else report('PASS', `${app}: env vars`, `${cfg.urlVar} and ${cfg.keyVar} set`);
  await checkSupabase(app, env, cfg);
  await checkPort(app, cfg.port);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall preflight checks passed');
process.exit(failed ? 1 : 0);
