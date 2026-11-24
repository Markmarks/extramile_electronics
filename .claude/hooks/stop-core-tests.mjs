#!/usr/bin/env node
/**
 * Stop hook: when Claude finishes a turn with uncommitted changes under packages/core
 * (money, pricing, msisdn, imei, order state — the rules everything else trusts), run the
 * core unit + property tests (~5 s). On failure, exit 2 so Claude keeps going and fixes
 * them before handing back. No core changes → does nothing. Fails open on gate errors.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.stop_hook_active) process.exit(0); // already continuing because of us

  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const changed = execSync('git status --porcelain -- packages/core', {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!changed) process.exit(0);

  try {
    execSync('pnpm --filter @extramile/core test', {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 120_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
      .split('\n')
      .filter((l) => /FAIL|×|Error|Counterexample|seed/.test(l));
    process.stderr.write(
      `packages/core tests fail with your uncommitted changes — fix before finishing:\n${out.slice(0, 30).join('\n')}\n`,
    );
    process.exit(2);
  }
} catch {
  /* fail open */
}
process.exit(0);
