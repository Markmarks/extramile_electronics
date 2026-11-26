/**
 * Counter-PC preferences (docs/07 §4 Settings). Device-local and not secret, so they live
 * in localStorage — never tokens or keys (those are in the OS keychain).
 */
export interface DeskSettings {
  /** Windows printer name, or SPOOL_PRINTER to write ESC/POS files instead. */
  printer: string;
  /** Printed under the logo line on receipts, e.g. shop address / phone. */
  receiptHeader: string;
  /** Printed at the bottom of receipts, e.g. returns policy line. */
  receiptFooter: string;
  /** Default number of barcode labels per print. */
  labelCopies: number;
}

export const SPOOL_PRINTER = 'Spool file (default)';
const KEY = 'extramile.desk-settings.v1';

export const DEFAULT_SETTINGS: DeskSettings = {
  printer: SPOOL_PRINTER,
  receiptHeader: 'ExtraMile Electronics · Accra',
  receiptFooter: 'Thank you! Keep this receipt for your warranty.',
  labelCopies: 1,
};

const clampText = (v: unknown, max: number, fallback: string) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;

/** Parse whatever is stored, falling back field-by-field to defaults. */
export function parseSettings(raw: string | null): DeskSettings {
  let o: Record<string, unknown> = {};
  try {
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (v && typeof v === 'object' && !Array.isArray(v)) o = v as Record<string, unknown>;
  } catch {
    /* corrupt → defaults */
  }
  const copies = Number(o.labelCopies);
  return {
    printer: clampText(o.printer, 200, DEFAULT_SETTINGS.printer) || SPOOL_PRINTER,
    receiptHeader: clampText(o.receiptHeader, 120, DEFAULT_SETTINGS.receiptHeader),
    receiptFooter: clampText(o.receiptFooter, 200, DEFAULT_SETTINGS.receiptFooter),
    labelCopies:
      Number.isInteger(copies) && copies >= 1 && copies <= 20
        ? copies
        : DEFAULT_SETTINGS.labelCopies,
  };
}

export function loadSettings(): DeskSettings {
  try {
    return parseSettings(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: DeskSettings): DeskSettings {
  const clean = parseSettings(JSON.stringify(s));
  globalThis.localStorage?.setItem(KEY, JSON.stringify(clean));
  return clean;
}
