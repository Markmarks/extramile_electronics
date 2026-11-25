import { refreshStorefront } from './storefront';
import { supabase } from './supabase';
import { deviceId } from './tauri';

/**
 * Call the admin-actions Edge Function — the only path for privileged back-office writes
 * (order status, refunds, roles, large stock moves). The server re-checks the caller's
 * role, dedupes on `idempotencyKey`, writes the audit log and sends customer emails.
 *
 * Reuse the same key when retrying the same intent (the offline outbox does) so a retry
 * after a dropped response can't apply twice.
 */
export async function invokeAdminAction<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown>,
  idempotencyKey: string = globalThis.crypto.randomUUID(),
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: {
      action,
      payload,
      idempotency_key: idempotencyKey,
      device_id: await deviceId(),
      source: 'desktop',
    },
  });
  if (error) throw new Error(await serverMessage(error));
  // Stock is shown on the shop ("Only 2 left", "Out of stock"), so refresh its cache.
  if (STOCK_ACTIONS.has(action)) refreshStorefront();
  const body = data as { ok?: boolean; replay?: boolean; result?: T } | null;
  return (body?.result ?? ({} as T)) as T;
}

const STOCK_ACTIONS = new Set(['stock_adjust_large', 'refund']);

/** supabase-js only says "non-2xx status code"; the function's JSON says why. */
async function serverMessage(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = error.context;
  if (ctx instanceof Response) {
    try {
      const j = (await ctx.clone().json()) as { error?: string };
      if (j?.error) return friendly(j.error);
    } catch {
      /* not JSON */
    }
  }
  return error.message;
}

function friendly(code: string): string {
  if (code === 'forbidden') return 'Your account is not allowed to do that.';
  if (code === 'device_revoked') return 'This PC has been revoked by an admin.';
  if (code === 'unauthenticated') return 'Your session expired — unlock again.';
  if (code.startsWith('PAID_ORDER_NEEDS_REFUND'))
    return 'This order is paid — refund it instead of cancelling.';
  if (code.startsWith('INVALID_TRANSITION'))
    return `Not allowed: ${code.replace('INVALID_TRANSITION: ', '')}.`;
  if (code.startsWith('STALE')) return code.replace(/^STALE: /, 'Changed elsewhere: ');
  return code;
}
