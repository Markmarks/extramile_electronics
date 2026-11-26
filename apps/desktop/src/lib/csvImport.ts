import { parseCedisText, parseCsv } from '@extramile/core';

/**
 * Bulk price / stock update by SKU from a CSV (docs/07 §4, PRD §4.8). Planning is pure and
 * runs before anything is written, so staff see every change and every error first.
 *
 * Columns (header row, any order, case-insensitive):
 *   sku    — required, must match an existing variant
 *   price  — optional, selling price in cedis ("1299.50", "GH₵ 1,299.50")
 *   stock  — optional, the counted on-hand quantity (applied as a delta, see below)
 */
export const MAX_IMPORT_ROWS = 5000;

export interface ImportVariant {
  id: string;
  sku: string;
  price: number; // pesewas
  stock: number;
  reserved: number;
}

export interface PlannedChange {
  line: number;
  sku: string;
  variantId: string;
  price?: { from: number; to: number };
  stock?: { from: number; to: number };
}
export interface ImportError {
  line: number;
  message: string;
}
export interface ImportPlan {
  changes: PlannedChange[];
  errors: ImportError[];
  unchanged: number;
}

const ALIASES: Record<string, 'sku' | 'price' | 'stock'> = {
  sku: 'sku',
  price: 'price',
  price_ghs: 'price',
  'price (ghs)': 'price',
  stock: 'stock',
  on_hand: 'stock',
  'on hand': 'stock',
  qty: 'stock',
};

export function planImport(csvText: string, variants: ImportVariant[]): ImportPlan {
  const errors: ImportError[] = [];
  let rows: string[][];
  try {
    rows = parseCsv(csvText);
  } catch (e) {
    return { changes: [], errors: [{ line: 0, message: (e as Error).message }], unchanged: 0 };
  }
  if (rows.length < 2) {
    return {
      changes: [],
      errors: [{ line: 0, message: 'The file has no data rows.' }],
      unchanged: 0,
    };
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    return {
      changes: [],
      errors: [{ line: 0, message: `Too many rows — ${MAX_IMPORT_ROWS} at most per file.` }],
      unchanged: 0,
    };
  }

  const header = rows[0]!.map((h) => ALIASES[h.trim().toLowerCase()]);
  const col = (k: 'sku' | 'price' | 'stock') => header.indexOf(k);
  if (col('sku') < 0) {
    return { changes: [], errors: [{ line: 1, message: 'Missing a "sku" column.' }], unchanged: 0 };
  }
  if (col('price') < 0 && col('stock') < 0) {
    return {
      changes: [],
      errors: [{ line: 1, message: 'Add a "price" and/or "stock" column.' }],
      unchanged: 0,
    };
  }

  const bySku = new Map(variants.map((v) => [v.sku.trim().toUpperCase(), v]));
  const seen = new Set<string>();
  const changes: PlannedChange[] = [];
  let unchanged = 0;

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const cell = (k: 'sku' | 'price' | 'stock') => (col(k) >= 0 ? (r[col(k)] ?? '').trim() : '');
    const sku = cell('sku');
    if (!sku) return errors.push({ line, message: 'Empty SKU.' });
    const key = sku.toUpperCase();
    if (seen.has(key)) return errors.push({ line, message: `${sku} appears more than once.` });
    seen.add(key);
    const v = bySku.get(key);
    if (!v) return errors.push({ line, message: `No variant with SKU ${sku}.` });

    const change: PlannedChange = { line, sku: v.sku, variantId: v.id };
    const priceRaw = cell('price');
    if (priceRaw) {
      const p = parseCedisText(priceRaw);
      if (p === null || p === 0)
        return errors.push({ line, message: `Price "${priceRaw}" is not an amount above 0.` });
      if (p !== v.price) change.price = { from: v.price, to: p };
    }
    const stockRaw = cell('stock');
    if (stockRaw) {
      if (!/^\d{1,6}$/.test(stockRaw))
        return errors.push({ line, message: `Stock "${stockRaw}" must be a whole number.` });
      const s = Number(stockRaw);
      if (s < v.reserved)
        return errors.push({
          line,
          message: `Stock ${s} is below the ${v.reserved} units held for unpaid orders.`,
        });
      if (s !== v.stock) change.stock = { from: v.stock, to: s };
    }
    if (change.price || change.stock) changes.push(change);
    else unchanged += 1;
  });

  return { changes, errors, unchanged };
}
