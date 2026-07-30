import 'server-only'; // hard build error if this module is imported into a Client Component

import type { Database } from '@extramile/core';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server code
 * (Route Handlers, Server Actions, cron) for guest-cart access and privileged
 * writes routed through RPCs. Never expose to the browser or the desktop binary.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient must never run in the browser');
  }
  return createSupabaseClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
