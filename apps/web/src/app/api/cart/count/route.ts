import { NextResponse } from 'next/server';
import { getCartCount } from '@/lib/cart/cart';

export const dynamic = 'force-dynamic';

// security-guard: no-input — no body/query/params; the cart cookie is read by getCartCount().
export async function GET() {
  const count = await getCartCount();
  return NextResponse.json({ count });
}
