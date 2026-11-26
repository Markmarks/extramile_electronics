import { NextResponse, type NextRequest } from 'next/server';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// security-guard: no-input — no body/query/params; the user comes from the session cookie (getUser()).
/**
 * "Download my data" (Data Protection Act right of access). Runs as the signed-in user,
 * so RLS limits every query to their own rows. No query input at all — the user id comes
 * from the verified session (getUser), never from the request.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  if (!rateLimit(`export:${user.id}:${clientIp(req.headers)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const [profile, addresses, orders, reviews, consent] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, phone, marketing_opt_in, created_at')
      .eq('id', user.id)
      .limit(1),
    supabase
      .from('addresses')
      .select(
        'label, recipient, phone, line1, line2, city, region, landmark, is_default, created_at',
      )
      .eq('user_id', user.id),
    supabase
      .from('orders')
      .select(
        'order_number, email, phone, status, payment_status, subtotal, shipping_fee, discount, tax, total, currency, coupon_code, ship_to, created_at, order_items(sku, title, attrs, unit_price, qty, line_total, warranty_months, serials), payments(reference, status, channel, amount, paid_at)',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('reviews')
      .select('rating, title, body, is_published, created_at, products(title)')
      .eq('user_id', user.id),
    supabase
      .from('consent_log')
      .select('kind, granted, source, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    note: 'Money amounts are in pesewas (100 pesewas = GH₵ 1).',
    account: {
      email: user.email,
      created_at: user.created_at,
      sign_in_methods: (user.identities ?? []).map((i) => i.provider),
      profile: profile.data?.[0] ?? null,
    },
    addresses: addresses.data ?? [],
    orders: orders.data ?? [],
    reviews: reviews.data ?? [],
    marketing_consent_history: consent.data ?? [],
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="extramile-my-data-${date}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
