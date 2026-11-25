#!/usr/bin/env node
/**
 * commit-msg hook helper: append `Verified: none` when the message has no `Verified:`
 * line, so every commit records how it was verified (see CLAUDE.md). The stamp goes above
 * any trailers (Co-Authored-By: …) so git still parses them. Never fails the commit.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
try {
  const msg = readFileSync(file, 'utf8');
  if (!/^Verified:/m.test(msg) && !/^(Merge|Revert|fixup!|squash!)/.test(msg)) {
    const lines = msg.replace(/\s+$/, '').split('\n');
    const content = lines.filter((l) => !l.startsWith('#'));
    // Find the trailing trailer block (Key: value lines at the end).
    let i = content.length;
    while (i > 1 && /^[A-Za-z-]+: .+/.test(content[i - 1])) i--;
    const hasTrailers = i < content.length && content[i - 1] === '';
    const body = hasTrailers ? content.slice(0, i - 1) : content;
    const trailers = hasTrailers ? content.slice(i) : [];
    const out = [...body, '', 'Verified: none', ...(trailers.length ? ['', ...trailers] : [])];
    writeFileSync(file, `${out.join('\n')}\n`);
  }
} catch {
  /* never block a commit */
}
