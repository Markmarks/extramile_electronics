import type { Database } from '@extramile/core';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';
import { sanitizeNext } from '@/lib/auth/next';

/**
 * Refresh the auth session on every request and guard /account and /admin.
 * Authorization uses getUser() (verifies the JWT), never getSession().
 * Non-staff hitting /admin get a 404 rewrite — don't confirm the route exists.
 * docs/05-OAUTH.md §6.
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser(); // refreshes the token

  const path = req.nextUrl.pathname;

  if (!user && (path.startsWith('/account') || path.startsWith('/admin'))) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', sanitizeNext(path));
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .returns<{ role: Database['public']['Enums']['user_role'] }[]>()
      .maybeSingle();
    if (!profile || !['staff', 'admin'].includes(profile.role)) {
      return NextResponse.rewrite(new URL('/404', req.url)); // 404, not 403
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|avif)$).*)'],
};
