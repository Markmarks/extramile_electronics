import { invokeAdminAction } from './adminActions';
import { outboxEnqueue } from './offline';
import { salePayload, type SaleInput, type SaleResult } from './walkInSale';

/**
 * Walk-in (counter) sales — docs/07 §4 and §7. The app sends only variant ids, quantities
 * and serials; admin-actions `walk_in_sale` → create_walk_in_order() prices them from the
 * database, checks free stock, takes it and records a paid 'manual' payment.
 *
 * Offline, the sale is queued with its idempotency key and a provisional `local-` number;
 * when the outbox replays it the server issues the real order number, recorded here so the
 * counter can reprint the receipt (docs/07 §7 "receipt is reprinted if the number changed").
 */
export * from './walkInSale';

function localRef(): string {
  return `local-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function recordSale(input: SaleInput, online: boolean): Promise<SaleResult> {
  if (input.lines.length === 0) throw new Error('Add at least one item to the sale.');
  const ref = localRef();
  const key = globalThis.crypto.randomUUID();
  const payload = salePayload(input, ref);
  if (!online) {
    await outboxEnqueue('walk_in_sale', payload, key);
    return { kind: 'queued', localRef: ref };
  }
  const r = await invokeAdminAction<{ orderId: string; orderNumber: string; total: number }>(
    'walk_in_sale',
    payload,
    key,
  );
  return { kind: 'recorded', orderId: r.orderId, orderNumber: r.orderNumber, total: r.total };
}

// ── offline sales that have since synced (for the reprint prompt) ───────────────
const SYNCED_KEY = 'extramile.walk-in-synced.v1';

export interface SyncedSale {
  localRef: string;
  orderNumber: string;
  orderId: string;
  at: string;
}

export function listSyncedSales(): SyncedSale[] {
  try {
    const v: unknown = JSON.parse(globalThis.localStorage?.getItem(SYNCED_KEY) ?? '[]');
    return Array.isArray(v) ? (v as SyncedSale[]).slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function rememberSyncedSale(s: SyncedSale): void {
  const list = [s, ...listSyncedSales().filter((x) => x.localRef !== s.localRef)].slice(0, 50);
  globalThis.localStorage?.setItem(SYNCED_KEY, JSON.stringify(list));
}

export function forgetSyncedSale(localRef: string): void {
  globalThis.localStorage?.setItem(
    SYNCED_KEY,
    JSON.stringify(listSyncedSales().filter((x) => x.localRef !== localRef)),
  );
}
