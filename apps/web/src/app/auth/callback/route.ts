import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@extramile/core';
import { publicEnv } from '@/lib/env';
import { sanitizeNext } from '@/lib/auth/next';
import { claimGuestOrders } from '@/lib/account/claim';
import { mergeGuestCart } from '@/lib/cart/merge';
import { z } from 'zod';

const querySchema = z.object({
  code: z.string().min(1).max(512).nullable(),
  next: z.string().max(2048).nullable(),
});

/**
 * OAuth / magic-link callback: PKCE code exchange, then merge the guest cart.
 * docs/05-OAUTH.md §5. The `next` param is sanitised server-side.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = querySchema.safeParse({
    code: url.searchParams.get('code'),
    next: url.searchParams.get('next'),
  });
  const code = query.success ? query.data.code : null;
  const next = sanitizeNext(query.success ? query.data.next : null);

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  const store = await cookies();
  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) =>
        list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', url.origin));
  }

  const cartToken = store.get('cart_token')?.value;
  if (cartToken) {
    try {
      await mergeGuestCart(cartToken, data.user.id);
      store.delete('cart_token');
    } catch {
      // Non-fatal: sign-in still succeeds; the cart merge can be retried later.
    }
  }

  await claimGuestOrders(data.user); // non-fatal; never throws

  return NextResponse.redirect(new URL(next, url.origin));
}
