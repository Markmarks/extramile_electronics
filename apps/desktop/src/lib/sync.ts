import type { OrderStatus } from '@extramile/core';
import { outboxMark, outboxPending, type OutboxItem } from './offline';
import { supabase } from './supabase';
import { deviceId } from './tauri';

/**
 * Replay one queued action. The server dedupes on the idempotency_key
 * (admin-actions → outbox_receipts), so re-sending after a mid-flush crash is safe.
 */
async function replay(item: OutboxItem, device: string): Promise<void> {
  switch (item.kind) {
    case 'order_transition': {
      if (!item.order_id) throw new Error('order_transition missing order_id');
      const status = String(item.payload.status) as OrderStatus;
      // Optimistic concurrency is enforced server-side via RLS/updated_at; a rejected
      // transition surfaces here as an error and the item stays pending for a diff dialog.
      const { error } = await supabase.from('orders').update({ status }).eq('id', item.order_id);
      if (error) throw new Error(error.message);
      break;
    }
    case 'serial_capture': {
      const { error } = await supabase
        .from('order_items')
        .update({ serials: item.payload.serials as string[] })
        .eq('id', String(item.payload.order_item_id));
      if (error) throw new Error(error.message);
      break;
    }
    case 'stock_adjust': {
      const { error } = await supabase.functions.invoke('admin-actions', {
        body: {
          action: 'stock_adjust_large',
          payload: item.payload,
          idempotency_key: item.idempotency_key,
          device_id: device,
          source: 'desktop',
        },
      });
      if (error) throw new Error(error.message);
      break;
    }
    case 'walk_in_sale':
      // Walk-in sync is completed with the walk-in flow in D5; no-op replay for now.
      break;
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
  const device = await deviceId();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    if (item.order_id && blockedOrders.has(item.order_id)) continue;
    try {
      await replay(item, device);
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
