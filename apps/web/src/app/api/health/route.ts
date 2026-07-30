import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Liveness + DB connectivity + build sha. Used by the deploy smoke test
 * (docs/03-SDLC.md §3). Always returns 200 so it can run on a fresh checkout;
 * the `db` field reports whether the database is reachable/configured.
 */
export async function GET() {
  let db: string;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('shipping_zones').select('id').limit(1);
    db = error ? `error: ${error.message}` : 'ok';
  } catch (err) {
    db =
      err instanceof Error && err.message.startsWith('Missing environment')
        ? 'unconfigured'
        : `error: ${err instanceof Error ? err.message : 'unknown'}`;
  }

  return NextResponse.json({
    status: 'ok',
    db,
    sha: serverEnv.gitSha,
    ts: new Date().toISOString(),
  });
}
