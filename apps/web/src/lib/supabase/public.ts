import type { Database } from '@extramile/core';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

/**
 * Cookie-free anon client for public catalogue reads. Because it doesn't touch
 * cookies(), pages using it stay statically renderable / ISR-cacheable. RLS still
 * applies with the anon role (public-read policies only).
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
