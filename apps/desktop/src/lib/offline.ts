import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

// Writes permitted while offline — mirrors the Rust allowlist (docs/07 §7).
export const WRITE_ALLOWLIST = [
  'order_transition',
  'serial_capture',
  'stock_adjust',
  'walk_in_sale',
] as const;
export type OfflineKind = (typeof WRITE_ALLOWLIST)[number];

export interface OutboxItem {
  id: number;
  kind: OfflineKind;
  payload: Record<string, unknown>;
  idempotency_key: string;
  order_id: string | null;
  attempts: number;
}

export async function cachePut(table: string, rows: Record<string, unknown>[]): Promise<number> {
  if (!isTauri) return 0;
  return invoke<number>('cache_put', { table, rows });
}

export async function cacheQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!isTauri) return [];
  return invoke<T[]>('cache_query', { sql });
}

export async function outboxEnqueue(
  kind: OfflineKind,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  orderId?: string,
): Promise<number> {
  if (!isTauri) throw new Error('The offline queue is only available in the desktop app.');
  return invoke<number>('outbox_enqueue', {
    kind,
    payload,
    idempotencyKey,
    orderId: orderId ?? null,
  });
}

export async function outboxPending(): Promise<OutboxItem[]> {
  if (!isTauri) return [];
  return invoke<OutboxItem[]>('outbox_pending');
}

export async function outboxMark(id: number, ok: boolean, error?: string): Promise<void> {
  if (!isTauri) return;
  await invoke('outbox_mark', { id, ok, error: error ?? null });
}
