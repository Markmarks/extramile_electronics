#!/usr/bin/env node
/**
 * Fail the build if server secrets leak into a shippable bundle.
 * Web: `node scripts/scan-bundle-secrets.mjs apps/web/.next`
 * Desktop (phase D1, test D-01): point it at the built MSI/NSIS payload + bundled JS.
 *
 * Scans for Paystack secret-key patterns and, when provided in the environment,
 * the literal SUPABASE_SERVICE_ROLE_KEY / PAYSTACK_SECRET_KEY values. (The bare
 * string "service_role" is intentionally NOT matched — it appears legitimately in
 * @supabase client code and would false-positive.)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const target = process.argv[2];
if (!target || !existsSync(target)) {
  console.error(`scan target not found: ${target ?? '(none)'}`);
  process.exit(1);
}

const patterns = [/sk_live_[A-Za-z0-9]{6,}/, /sk_test_[A-Za-z0-9]{6,}/];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const v of [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.PAYSTACK_SECRET_KEY]) {
  if (v && v.length > 12) patterns.push(new RegExp(escape(v)));
}

const scanExts = new Set(['.js', '.mjs', '.cjs', '.map', '.html', '.json', '.txt']);
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(target).filter((f) => scanExts.has(extname(f)));
const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const re of patterns) {
    if (re.test(text)) hits.push(`${file}  ::  ${re}`);
  }
}

if (hits.length > 0) {
  console.error(`✗ Secret patterns found in ${target}:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`✓ No secret patterns in ${files.length} scanned files under ${target}`);
