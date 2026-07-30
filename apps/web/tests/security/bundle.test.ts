import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * S-11 — server secrets must never reach the client bundle (docs/04-TEST-PLAN.md §4).
 * Runs against the built .next output when present (skips on an unbuilt tree; the
 * enforced CI gate is scripts/scan-bundle-secrets.mjs after `pnpm build`).
 */
const STATIC_DIR = join(process.cwd(), '.next', 'static');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe.skipIf(!existsSync(STATIC_DIR))('S-11: no server secrets in the client bundle', () => {
  const files = walk(STATIC_DIR).filter((f) => /\.(js|mjs|map)$/.test(f));

  it('contains no Paystack secret-key patterns', () => {
    const offenders = files.filter((f) =>
      /sk_(live|test)_[A-Za-z0-9]/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('does not embed the service-role key value', () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || key.length < 20) return;
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(key));
    expect(offenders).toEqual([]);
  });
});
