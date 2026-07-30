'use server';

import { getCheckoutQuote, type CheckoutQuote } from './quote';

/** Recompute totals when the zone or coupon changes. Server is authoritative. */
export async function quoteAction(
  zoneId: string | null,
  couponCode: string | null,
): Promise<CheckoutQuote> {
  return getCheckoutQuote(zoneId || null, couponCode?.trim().toUpperCase() || null);
}
