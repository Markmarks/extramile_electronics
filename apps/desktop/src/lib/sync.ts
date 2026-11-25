import type { OrderStatus } from '@extramile/core';
import { invokeAdminAction } from './adminActions';
import { outboxMark, outboxPending, type OutboxItem } from './offline';
import { saveSerials } from './orders';

/**
 * Replay one queued action. The server dedupes on the idempotency_key
 * (admin-actions → outbox_receipts), so re-sending after a mid-flush crash is safe.
 */
async function replay(item: OutboxItem): Promise<void> {
  switch (item.kind) {
    case 'order_transition': {
      if (!item.order_id) throw new Error('order_transition missing order_id');
      const to = String(item.payload.status) as OrderStatus;
      // Items queued before this change have no `from`; the server then only checks
      // that the move is legal. A refusal (stale/illegal) keeps the item pending.
      const from = item.payload.from ? (String(item.payload.from) as OrderStatus) : null;
      await invokeAdminAction(
        'order_transition',
        { order_id: item.order_id, from, to },
        item.idempotency_key,
      );
      break;
    }
    case 'serial_capture': {
      await saveSerials(String(item.payload.order_item_id), item.payload.serials as string[]);
      break;
    }
    case 'stock_adjust': {
      await invokeAdminAction('stock_adjust_large', item.payload, item.idempotency_key);
      break;
    }
    case 'walk_in_sale':
      // Walk-in sync arrives with the walk-in flow (D5). Until then keep the item pending —
      // marking it synced would silently discard the sale.
      throw new Error('Walk-in sales cannot sync yet — kept in the queue.');
  }
}

export interface FlushReport {
  synced: number;
  failed: number;
}

/** Flush the outbox, preserving per-order ordering (stop an order's chain on first failure). */
export async function runSync(): Promise<FlushReport> {
  const items = await outboxPending();
  const blockedOrders = new Set<string>();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    if (item.order_id && blockedOrders.has(item.order_id)) continue;
    try {
      await replay(item);
      await outboxMark(item.id, true);
      synced += 1;
    } catch (err) {
      await outboxMark(item.id, false, err instanceof Error ? err.message : 'sync error');
      failed += 1;
      if (item.order_id) blockedOrders.add(item.order_id);
    }
  }
  return { synced, failed };
}
