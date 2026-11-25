import { isAuthApiError, isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

/**
 * Why restoring the sealed session failed on PIN unlock.
 *
 * network  — the server couldn't be reached (offline, DNS, paused project, 5xx). The
 *            sealed token may be perfectly fine: keep the vault, let them retry.
 * rejected — Supabase answered and refused the token (already used, not found, session
 *            gone). Retrying can't help; the device has to be forgotten and re-enrolled.
 * unknown  — anything else; keep the vault and show the raw message.
 */
export type UnlockFailure = 'network' | 'rejected' | 'unknown';

export function classifyRefreshError(e: unknown): UnlockFailure {
  if (isAuthRetryableFetchError(e)) return 'network';
  if (isAuthError(e) && (e.status === 0 || (e.status ?? 0) >= 500)) return 'network';
  if (isAuthApiError(e) && e.status >= 400 && e.status < 500 && e.status !== 429) {
    return 'rejected';
  }
  return 'unknown';
}

export const UNLOCK_NETWORK_MESSAGE =
  "Can't reach the server. Check the internet connection and try your PIN again.";
export const UNLOCK_REJECTED_MESSAGE =
  "This device's sign-in is no longer valid. Click Forget this device below, then sign in again.";

export function unlockFailureMessage(kind: UnlockFailure, e: unknown): string {
  if (kind === 'network') return UNLOCK_NETWORK_MESSAGE;
  if (kind === 'rejected') return UNLOCK_REJECTED_MESSAGE;
  const raw = e instanceof Error ? e.message : '';
  return `Couldn't restore the session${raw ? ` (${raw})` : ''}. Try your PIN again; if it keeps failing, forget this device and sign in again.`;
}
