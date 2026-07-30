import { invoke } from '@tauri-apps/api/core';

/** True inside the Tauri webview; false in a plain browser (vite dev/preview). */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Secrets live in the OS keychain via the Rust `keyring` commands — never localStorage.
export async function secureSet(key: string, value: string): Promise<void> {
  if (!isTauri) return;
  await invoke('secure_set', { key, value });
}
export async function secureGet(key: string): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>('secure_get', { key });
}
export async function secureClear(key: string): Promise<void> {
  if (!isTauri) return;
  await invoke('secure_clear', { key });
}

export async function deviceId(): Promise<string> {
  if (!isTauri) return 'dev-device';
  return invoke<string>('device_id');
}

export async function openExternal(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, '_blank');
    return;
  }
  await invoke('open_external', { url });
}

/** Blocks in Rust until the loopback listener on :1421 receives ?code=…, then returns it. */
export async function oauthListen(): Promise<string> {
  return invoke<string>('oauth_listen');
}
