import { supabase } from './supabase';

/**
 * The public storefront (apps/web). Its product and listing pages are cached (ISR,
 * revalidate = 300 s), so a catalogue edit made here would otherwise take 5+ minutes —
 * and one stale visit — to show. After every catalogue write we ask the storefront to
 * drop its cache (POST /api/revalidate, which checks the caller is staff).
 *
 * Must be listed in tauri.conf.json's CSP connect-src.
 */
export const STOREFRONT_URL = (
  import.meta.env.VITE_STOREFRONT_URL || 'https://www.dnvmart.com'
).replace(/\/+$/, '');

/**
 * Fire-and-forget: the database write already succeeded, so a failed refresh only means
 * the shop shows the change a few minutes late. Never throws.
 */
export function refreshStorefront(): void {
  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${STOREFRONT_URL}/api/revalidate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) console.warn('[storefront] refresh refused:', res.status);
    } catch (err) {
      console.warn('[storefront] refresh failed:', err instanceof Error ? err.message : err);
    }
  })();
}
