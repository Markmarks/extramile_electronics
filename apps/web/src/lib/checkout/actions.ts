'use server';

import { uuidSchema } from '@extramile/core';
import { z } from 'zod';
import { getCheckoutQuote, type CheckoutQuote } from './quote';

// A server action is a public endpoint: anyone can POST to it with any arguments, not
// only the checkout form. Same coupon bounds as createOrderSchema (README rule 7).
const zoneSchema = uuidSchema.nullable();
const couponSchema = z.string().trim().toUpperCase().min(1).max(40).nullable();

/** Recompute totals when the zone or coupon changes. Server is authoritative. */
export async function quoteAction(
  zoneId: string | null,
  couponCode: string | null,
): Promise<CheckoutQuote> {
  const zone = zoneSchema.safeParse(zoneId || null);
  const coupon = couponSchema.safeParse(
    typeof couponCode === 'string' && couponCode.trim() ? couponCode : null,
  );
  const quote = await getCheckoutQuote(
    zone.success ? zone.data : null,
    coupon.success ? coupon.data : null,
  );
  return coupon.success ? quote : { ...quote, couponError: 'Invalid coupon code.' };
}
