import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Liveness + DB connectivity + build sha. Used by the deploy smoke test
 * (docs/03-SDLC.md §3). Always returns 200 so it can run on a fresh checkout;
 * the `db` field reports whether the database is reachable/configured.
 */
// security-guard: no-input — public liveness probe, takes no input.
export async function GET() {
  // This endpoint is public: never echo raw error messages. Driver/runtime errors can
  // contain env values (e.g. an invalid header value that *is* the service-role key).
  // Details go to the server log only.
  let db: 'ok' | 'unconfigured' | 'error';
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('shipping_zones').select('id').limit(1);
    if (error) console.error('[health] db query failed:', error.code ?? 'unknown');
    db = error ? 'error' : 'ok';
  } catch (err) {
    const missing = err instanceof Error && err.message.startsWith('Missing environment');
    if (!missing)
      console.error('[health] db client failed:', err instanceof Error ? err.name : 'unknown');
    db = missing ? 'unconfigured' : 'error';
  }

  return NextResponse.json({
    status: 'ok',
    db,
    sha: serverEnv.gitSha,
    ts: new Date().toISOString(),
  });
}
