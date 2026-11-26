import { invokeAdminAction } from './adminActions';
import { cachePut, cacheQuery, outboxEnqueue } from './offline';
import { supabase } from './supabase';

// Inventory reads (RLS: staff_var / staff_inv) and stock writes. Available stock is
// on-hand minus reserved. Stock never changes by writing product_variants.stock: every
// change goes through admin-actions → adjust_stock / receive_stock (one atomic UPDATE
// that also writes the inventory_movements log).

/** Reasons offered when adjusting stock by hand (stored on the movement). */
export const ADJUST_REASONS = [
  { value: 'count_correction', label: 'Stock count correction' },
  { value: 'damaged', label: 'Damaged / unsellable' },
  { value: 'lost_or_stolen', label: 'Lost or stolen' },
  { value: 'return_to_supplier', label: 'Returned to supplier' },
  { value: 'customer_return', label: 'Customer return (restock)' },
  { value: 'found', label: 'Found in store' },
] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number]['value'];

/** Goods in: +qty, with optional unit cost (pesewas) and supplier. Online only. */
export async function receiveStock(
  variantId: string,
  qty: number,
  unitCost: number | null,
  supplier: string,
): Promise<void> {
  if (!Number.isInteger(qty) || qty < 1) throw new Error('Enter a whole number of units.');
  await invokeAdminAction('stock_receive', {
    variant_id: variantId,
    qty,
    unit_cost: unitCost,
    supplier: supplier.trim() || null,
  });
}

/**
 * Manual adjustment with a mandatory reason. Allowed offline (docs/07 §7): queued in the
 * outbox and replayed with the same idempotency key, so it applies once.
 */
export async function adjustStock(
  variantId: string,
  delta: number,
  reason: AdjustReason,
  online: boolean,
): Promise<'applied' | 'queued'> {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Enter a change other than 0.');
  if (!ADJUST_REASONS.some((r) => r.value === reason)) throw new Error('Choose a reason.');
  const payload = { variant_id: variantId, delta, reason };
  const key = globalThis.crypto.randomUUID();
  if (online) {
    await invokeAdminAction('stock_adjust_large', payload, key);
    return 'applied';
  }
  await outboxEnqueue('stock_adjust', payload, key);
  return 'queued';
}

export interface VariantStock {
  id: string;
  sku: string;
  title: string;
  stock: number;
  reserved: number;
  available: number;
  price: number; // pesewas
}

export interface Movement {
  id: number;
  sku: string | null;
  delta: number;
  reason: string;
  created_at: string;
  unit_cost: number | null;
  supplier: string | null;
}

interface VariantJoin {
  id: string;
  sku: string;
  stock: number;
  reserved: number;
  price: number;
  products: { title: string } | null;
}

/**
 * All active variants with their product title and computed availability. A successful
 * read refreshes the offline cache; when the network read fails (offline), the last
 * cached copy is returned so the counter can still sell (docs/07 §7 offline reads).
 */
export async function listVariantStock(): Promise<VariantStock[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, sku, stock, reserved, price, products(title)')
    .eq('is_active', true)
    .returns<VariantJoin[]>();
  if (error || !data) return cachedVariantStock();
  const rows = mapVariants(data);
  void cachePut('variants', rows as unknown as Record<string, unknown>[]).catch(() => 0);
  return rows;
}

async function cachedVariantStock(): Promise<VariantStock[]> {
  try {
    const rows = await cacheQuery<{ data: string }>(
      "select data from cache_kv where table_name = 'variants'",
    );
    return rows
      .map((r) => JSON.parse(r.data) as VariantStock)
      .sort((a, b) => a.available - b.available);
  } catch {
    return [];
  }
}

function mapVariants(data: VariantJoin[]): VariantStock[] {
  return data
    .map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.products?.title ?? '—',
      stock: v.stock,
      reserved: v.reserved,
      available: v.stock - v.reserved,
      price: v.price,
    }))
    .sort((a, b) => a.available - b.available);
}

interface MovementJoin {
  id: number;
  delta: number;
  reason: string;
  created_at: string;
  unit_cost: number | null;
  supplier: string | null;
  product_variants: { sku: string } | null;
}

export async function listRecentMovements(limit = 50): Promise<Movement[]> {
  const { data } = await supabase
    .from('inventory_movements')
    .select('id, delta, reason, created_at, unit_cost, supplier, product_variants(sku)')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<MovementJoin[]>();
  return (data ?? []).map((m) => ({
    id: m.id,
    sku: m.product_variants?.sku ?? null,
    delta: m.delta,
    reason: m.reason,
    created_at: m.created_at,
    unit_cost: m.unit_cost,
    supplier: m.supplier,
  }));
}

export interface StockSummary {
  skuCount: number;
  totalUnits: number;
  retailValue: number; // pesewas: Σ stock × price
}

export function summarise(rows: VariantStock[]): StockSummary {
  return rows.reduce<StockSummary>(
    (acc, v) => ({
      skuCount: acc.skuCount + 1,
      totalUnits: acc.totalUnits + v.stock,
      retailValue: acc.retailValue + v.stock * v.price,
    }),
    { skuCount: 0, totalUnits: 0, retailValue: 0 },
  );
}
