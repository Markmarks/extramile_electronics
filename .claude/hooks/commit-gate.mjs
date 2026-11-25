#!/usr/bin/env node
/**
 * Commit gate (PreToolUse on Bash/PowerShell). Before Claude runs `git commit`, checks
 * that this session actually verified the change: ran the verify skill / preflight /
 * Playwright / /code-review, or the commit message carries an explicit
 * `Verified: none — <reason>` explanation.
 *
 * Mode lives in .claude/verify-gate.json → { "mode": "off" | "observe" | "enforce" }.
 *   observe  — never blocks; appends what it *would* have blocked to .claude/verify-gate.log
 *   enforce  — denies the commit with a reason Claude can act on. After 2 blocks in one
 *              session the next commit is let through (logged) so Claude can't get stuck.
 * Any error inside the gate fails open (exit 0): a broken gate must not stop work.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GIT_COMMIT = /(^|[;&|(\s])git(\s+-C\s+\S+)?\s+commit(\s|$)/;
const VERIFIED_IN_TRANSCRIPT = [
  /"skill"\s*:\s*"(verify|code-review)"/, // Skill tool invocations
  /<command-name>\/?(verify|code-review)<\/command-name>/, // user-typed slash commands
  /verify-preflight\.mjs|verify:preflight/,
  /playwright test|pnpm e2e/,
];
const EXPLAINED = /Verified:\s*\S/;

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const logFile = join(root, '.claude', 'verify-gate.log');

function mode() {
  try {
    return (
      JSON.parse(readFileSync(join(root, '.claude', 'verify-gate.json'), 'utf8')).mode ?? 'observe'
    );
  } catch {
    return 'observe';
  }
}

function log(entry) {
  try {
    appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch {
    /* logging is best-effort */
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = String(input.tool_input?.command ?? '');
  if (!GIT_COMMIT.test(command)) return;

  const m = mode();
  if (m === 'off') return;

  let transcript = '';
  try {
    if (input.transcript_path && existsSync(input.transcript_path))
      transcript = readFileSync(input.transcript_path, 'utf8');
  } catch {
    /* unreadable transcript → treat as unverified */
  }
  const how = VERIFIED_IN_TRANSCRIPT.find((re) => re.test(transcript));
  const explained = EXPLAINED.test(command);
  if (how || explained) {
    log({
      mode: m,
      session: input.session_id,
      result: 'allowed',
      reason: how ? `transcript ${how}` : 'Verified: line in message',
    });
    return;
  }

  if (m === 'observe') {
    log({
      mode: m,
      session: input.session_id,
      result: 'would-block',
      command: command.slice(0, 200),
    });
    return;
  }

  // enforce
  const dir = join(tmpdir(), 'claude-verify-gate');
  mkdirSync(dir, { recursive: true });
  const counter = join(dir, `${String(input.session_id).replace(/[^\w-]/g, '')}.count`);
  const blocks = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) || 0 : 0;
  if (blocks >= 2) {
    log({
      mode: m,
      session: input.session_id,
      result: 'allowed-after-2-blocks',
      command: command.slice(0, 200),
    });
    return;
  }
  writeFileSync(counter, String(blocks + 1));
  log({ mode: m, session: input.session_id, result: 'blocked', command: command.slice(0, 200) });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'Commit gate: no verification found in this session. Run the `verify` skill ' +
          '(pnpm verify:preflight, pnpm test, pnpm e2e) or /code-review first, then commit ' +
          'with a `Verified: <how>` line — or, if verification genuinely does not apply, ' +
          'add `Verified: none — <reason>` to the commit message.',
      },
    }),
  );
}

try {
  main();
} catch (e) {
  log({ result: 'gate-error', error: String(e) });
}
process.exit(0);
