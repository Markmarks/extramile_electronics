import type { Database } from '@extramile/core';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';

/**
 * Server Supabase client bound to the request cookies. Use in Route Handlers and
 * Server Actions (which may write auth cookies) and in Server Components (read-only —
 * the setAll write is swallowed there, per docs/05-OAUTH.md §6).
 *
 * ALWAYS authorize with `supabase.auth.getUser()`, never `getSession()`.
 */
export async function createClient() {
  const store = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component — cookie writes are not allowed here and
          // are handled by the middleware refresh instead. Safe to ignore.
        }
      },
    },
  });
}
