// Tech specs live in products.specs (jsonb). Each category's spec_schema lists the
// expected keys and their types, e.g. {"ram_gb": {"type": "number", "facet": true}}.
// Products may also carry extra keys the schema doesn't list.

export type SpecType = 'string' | 'number' | 'boolean';
export type SpecValue = string | number | boolean;

export interface SpecField {
  key: string;
  type: SpecType;
}

/**
 * Display order for known spec keys. jsonb doesn't keep key order, so spec_schema
 * can't carry it. One list covers every category: within each one it reads
 * phones   display → chipset → RAM → storage → camera → battery → OS
 * laptops  display → CPU → GPU → RAM → storage → OS
 * TVs      size → panel → resolution → HDR → smart OS
 * audio    type → connectivity → ANC → battery hours
 * Keys not listed here (staff-added extras) sort after these, alphabetically.
 */
export const SPEC_ORDER: readonly string[] = [
  'display_in',
  'size_in',
  'panel',
  'resolution',
  'hdr',
  'smart_os',
  'type',
  'connectivity',
  'anc',
  'compatibility',
  'chipset',
  'cpu',
  'gpu',
  'ram_gb',
  'storage_gb',
  'rear_cam_mp',
  'battery_mah',
  'battery_hours',
  'os',
];

/** Sort spec keys into display order (known keys first, then the rest A–Z). */
export function orderSpecKeys(keys: string[]): string[] {
  const rank = (k: string) => {
    const i = SPEC_ORDER.indexOf(k);
    return i === -1 ? SPEC_ORDER.length : i;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Schema keys in display order, with a safe type for each. */
export function specFields(schema: Record<string, unknown>): SpecField[] {
  return orderSpecKeys(Object.keys(schema)).map((key) => {
    const t = (schema[key] as { type?: unknown } | null)?.type;
    return { key, type: t === 'number' || t === 'boolean' ? t : 'string' };
  });
}

/** Human label for a spec key: `battery_mah` → `Battery (mAh)`, `ram_gb` → `RAM (GB)`. */
export function specLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bIn\b/, '(in)')
    .replace(/\bMah\b/, '(mAh)')
    .replace(/\bGb\b/i, '(GB)')
    .replace(/\bMp\b/, '(MP)')
    .replace(/\b(Anc|Hdr|Os|Ram|Cpu|Gpu|Imei|Usb)\b/g, (w) => w.toUpperCase());
}

/** Turn free text into a spec key: `Screen refresh (Hz)` → `screen_refresh_hz`. */
export function specKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function displaySpecValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
