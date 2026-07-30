# OAuth Spec — Supabase Auth (Google + Apple)

Flow: **Authorization Code + PKCE**, server-side code exchange, session in httpOnly cookies via `@supabase/ssr`. No implicit flow, no tokens in localStorage, no `access_token` in URLs.

## 1. Providers

| Provider | Scopes | Notes |
|---|---|---|
| Google | `openid email profile` | primary; ~most GH desktop + Android traffic |
| Apple | `name email` | required if an iOS wrapper ships later; email may be a private relay address |
| Email OTP / password | — | fallback, always enabled |

## 2. Redirect URLs

Supabase callback (registered with the provider):
```
https://<project-ref>.supabase.co/auth/v1/callback
```
App callback (registered in Supabase → Authentication → URL Configuration → Redirect URLs):
```
http://localhost:3000/auth/callback
https://*-yourteam.vercel.app/auth/callback      # preview wildcard
https://store.example.com/auth/callback          # production
http://localhost:1421/callback                   # Tauri desktop admin (loopback, see 07)
```
The desktop app signs in through the **system browser** with the same Supabase Google client — Google only ever sees Supabase's callback, so no separate desktop OAuth client is needed. Details in `07-DESKTOP-ADMIN.md` §8.
Site URL (prod project): `https://store.example.com`.
**Prod Supabase project must not list localhost or preview URLs.** Use a separate Supabase project + separate Google client for staging.

## 3. Provider setup

**Google Cloud Console** → APIs & Services → Credentials → OAuth client (Web application):
- Authorized JavaScript origins: `https://store.example.com`
- Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
- OAuth consent screen: External, published, logo + privacy/terms URLs (required or Google shows an unverified-app warning).
- Paste Client ID + Secret into Supabase → Authentication → Providers → Google.

**Apple Developer** → Certificates, IDs & Profiles:
- App ID with Sign in with Apple enabled → Services ID (this is the client_id).
- Return URL: `https://<project-ref>.supabase.co/auth/v1/callback`
- Key (.p8) + Key ID + Team ID → Supabase generates the client secret JWT (it expires every 6 months if self-generated; prefer entering p8/KeyID/TeamID so Supabase rotates it).

## 4. Client — start the flow

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';
export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
```

```ts
// components/auth/oauth-buttons.tsx
async function signIn(provider: 'google' | 'apple', next = '/') {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: provider === 'google'
        ? { access_type: 'offline', prompt: 'consent' }   // needed for a refresh token
        : undefined,
    },
  });
  if (error) toast.error('Could not start sign-in. Try email instead.');
}
```
`next` is validated server-side (§6) — never redirect to an absolute external URL.

## 5. Server — code exchange

```ts
// app/auth/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { mergeGuestCart } from '@/lib/cart/merge';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const rawNext = url.searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));

  const store = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', url.origin));
  }

  // guest cart → user cart
  const cartToken = store.get('cart_token')?.value;
  if (cartToken) await mergeGuestCart(cartToken, data.user.id);

  return NextResponse.redirect(new URL(next, url.origin));
}
```

## 6. Middleware — session refresh + route guards

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
    }}
  );

  const { data: { user } } = await supabase.auth.getUser();   // refreshes the token
  const path = req.nextUrl.pathname;

  if (!user && (path.startsWith('/account') || path.startsWith('/admin'))) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(path)}`, req.url));
  }
  if (path.startsWith('/admin')) {
    const { data: p } = await supabase.from('profiles').select('role').eq('id', user!.id).single();
    if (!p || !['staff','admin'].includes(p.role)) {
      return NextResponse.rewrite(new URL('/404', req.url));   // 404, not 403 — don't confirm the route
    }
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|avif)$).*)'],
};
```

Rules:
- Always `supabase.auth.getUser()` on the server — **never trust `getSession()`** for authorization (it reads the cookie without verifying).
- Middleware must return the `res` object it mutated, or refreshed cookies are dropped and users get random logouts.
- Server Components use a read-only server client; only Route Handlers / Server Actions write auth cookies.

## 7. Profile & identity handling
- `handle_new_user` trigger (Data Model §002) creates the `profiles` row for OAuth signups; `full_name` read from `raw_user_meta_data.full_name` (Google) or `name` (Apple, first sign-in only — **Apple sends the name once**, so persist it immediately).
- Apple private-relay emails (`…@privaterelay.appleid.com`) are valid — do not block them, and send order email there.
- `phone` is null after OAuth → checkout collects and validates it, then writes to `profiles`.
- Account linking: Supabase links identities with the same verified email only when *Manual linking* is enabled; otherwise a second provider on the same email errors. Decision for v1: enable manual linking, expose **Account → Connected accounts** with `linkIdentity()` / `unlinkIdentity()`, and block unlink if it is the last identity and no password is set.
- Guest orders are claimed post-signup: match `orders.email = user.email` and set `user_id` (server-side, one-time, only for orders with `payment_status='paid'`).

## 8. Sign-out
```ts
await supabase.auth.signOut({ scope: 'local' });   // 'global' to kill all devices
```
Then clear `cart_token`, revalidate, and redirect to `/`.

## 9. Security requirements
| Control | Requirement |
|---|---|
| PKCE | on (default for `createBrowserClient` + `exchangeCodeForSession`) |
| `next` param | must start with a single `/`; reject `//` and absolute URLs (open-redirect) |
| Cookies | httpOnly, `secure` in prod, `SameSite=Lax`, domain scoped to the store host |
| JWT expiry | access token 1h, refresh rotation on; re-auth required for email/password change |
| Rate limits | 6 sign-in attempts/min/IP; Supabase Auth rate limits left at defaults or lower |
| Role escalation | `profiles.role` writable only by `service_role`; RLS policy pins role on self-update (S-05) |
| Leaked-password protection | enabled in Supabase Auth settings |
| CSP | `frame-ancestors 'none'`; allow `https://accounts.google.com` and `https://appleid.apple.com` in `form-action`/`connect-src` |
| Secrets | provider client secrets only in Supabase dashboard; never in the repo |

## 10. OAuth test cases (feed into `04-TEST-PLAN.md`)
| ID | Case | Expected |
|---|---|---|
O-01 | Google first-time sign-in | user + profile row created, `full_name` populated, redirected to `next` |
O-02 | Google returning sign-in | no duplicate profile, session cookie set |
O-03 | Apple first sign-in | name persisted; second sign-in without name does not overwrite it with null |
O-04 | Apple private relay email | order emails deliver |
O-05 | User denies consent on provider screen | redirected to `/login?error=oauth_failed`, no user created |
O-06 | `next=https://evil.com` | ignored, redirect to `/` |
O-07 | Sign-in with guest cart of 2 items | items merged into user cart, guest cart deleted, `cart_token` cleared |
O-08 | Same email via Google then password | linking behaves per §7 decision, no duplicate account |
O-09 | Expired access token mid-session | middleware refreshes silently, no logout |
O-10 | Session cookie tampered | `getUser()` fails → treated as anon |
O-11 | Staff role via OAuth account | `/admin` reachable; customer gets 404 |
O-12 | Sign-out | cookies cleared, `/account` redirects to `/login` |
