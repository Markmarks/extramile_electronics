/**
 * CSV for back-office export/import (docs/07 §4). RFC 4180: comma-separated, quoted fields
 * may contain commas, quotes ("") and newlines; CRLF or LF line ends; a UTF-8 BOM is ignored.
 * Pure TS — runs in the webview.
 */
import type { Pesewas } from './money';

/** Characters that make a spreadsheet treat a cell as a formula (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

function quoteCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  // Text that would run as a formula in Excel/Sheets is prefixed with ' (shown as text).
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows → CSV text with CRLF line ends (what Excel expects). Numbers are written as-is. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(quoteCell).join(',')).join('\r\n') + '\r\n';
}

/** CSV text → rows of raw strings. Blank lines are skipped. Throws on an unclosed quote. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let quotedCell = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
    quotedCell = false;
  };
  const endRow = () => {
    endCell();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"' && cell === '' && !quotedCell) {
      inQuotes = true;
      quotedCell = true;
    } else if (c === ',') endCell();
    else if (c === '\n') endRow();
    else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else cell += c;
  }
  if (inQuotes) throw new Error('CSV has an unclosed quote.');
  if (cell !== '' || row.length) endRow();
  return rows;
}

/**
 * A cedis amount typed by a person ("1,299.50", "GH₵ 25", "GHS 3") → integer pesewas.
 * Strict: at most 2 decimal places, no negatives, no exponents. Returns null if invalid.
 * Uses string arithmetic, so no float rounding is involved.
 */
export function parseCedisText(raw: string): Pesewas | null {
  const s = raw
    .trim()
    .replace(/^(GH₵|GHS|GH¢|₵)\s*/i, '')
    .replace(/,/g, '');
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(2, '0'));
  const p = whole * 100 + frac;
  return Number.isSafeInteger(p) ? p : null;
}
