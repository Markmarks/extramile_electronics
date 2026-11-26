import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

// security-guard: no-input — reads only the session cookie; the body is ignored.
/** Sign out (local scope), clear the guest cart token, and return home. docs/05-OAUTH.md §8. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });

  const store = await cookies();
  store.delete('cart_token');

  return NextResponse.redirect(new URL('/', req.url), { status: 303 });
}
