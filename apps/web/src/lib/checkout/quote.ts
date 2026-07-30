import 'server-only';

import { computeTotals, PricingError, type Coupon } from '@extramile/core';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPublicClient } from '@/lib/supabase/public';
import { getCart } from '@/lib/cart/cart';

export interface ShippingZoneView {
  id: string;
  name: string;
  baseFee: number;
  freeOver: number | null;
  etaMin: number;
  etaMax: number;
}

export interface CheckoutQuote {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  itemCount: number;
  zoneId: string | null;
  couponCode: string | null;
  couponError: string | null;
}

export async function getShippingZones(): Promise<ShippingZoneView[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('shipping_zones')
    .select('id, name, base_fee, free_over, eta_days_min, eta_days_max')
    .eq('is_active', true)
    .order('base_fee', { ascending: true })
    .returns<
      {
        id: string;
        name: string;
        base_fee: number;
        free_over: number | null;
        eta_days_min: number;
        eta_days_max: number;
      }[]
    >();
  return (data ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    baseFee: z.base_fee,
    freeOver: z.free_over,
    etaMin: z.eta_days_min,
    etaMax: z.eta_days_max,
  }));
}

type CouponRow = {
  code: string;
  kind: Coupon['kind'];
  value: number;
  min_subtotal: number;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  is_active: boolean;
};

function toCoupon(row: CouponRow): Coupon {
  return {
    code: row.code,
    kind: row.kind,
    value: row.value,
    minSubtotal: row.min_subtotal,
    isActive: row.is_active,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
  };
}

/**
 * Compute checkout totals from the DB only — the client never sends prices
 * (docs/01-PRD.md §4.4). Mirrors the create_order RPC's math via @extramile/core.
 */
export async function getCheckoutQuote(
  zoneId: string | null,
  couponCode: string | null,
): Promise<CheckoutQuote> {
  const cart = await getCart();
  const lines = cart.lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty }));
  if (lines.length === 0) {
    return {
      subtotal: 0,
      shipping: 0,
      discount: 0,
      total: 0,
      itemCount: 0,
      zoneId: null,
      couponCode: null,
      couponError: null,
    };
  }

  const admin = createAdminClient();

  let baseFee = 0;
  let freeOver: number | null = null;
  let resolvedZone: string | null = null;
  if (zoneId) {
    const { data: zone } = await admin
      .from('shipping_zones')
      .select('base_fee, free_over, is_active')
      .eq('id', zoneId)
      .limit(1)
      .returns<{ base_fee: number; free_over: number | null; is_active: boolean }[]>();
    if (zone?.[0]?.is_active) {
      baseFee = zone[0].base_fee;
      freeOver = zone[0].free_over;
      resolvedZone = zoneId;
    }
  }

  let coupon: Coupon | null = null;
  let couponError: string | null = null;
  if (couponCode) {
    const { data } = await admin
      .from('coupons')
      .select(
        'code, kind, value, min_subtotal, starts_at, ends_at, max_redemptions, redemption_count, is_active',
      )
      .eq('code', couponCode)
      .limit(1)
      .returns<CouponRow[]>();
    if (data?.[0]) coupon = toCoupon(data[0]);
    else couponError = 'That code was not found.';
  }

  try {
    const totals = computeTotals({ lines, shippingBaseFee: baseFee, freeOver, coupon });
    return {
      ...totals,
      itemCount: cart.count,
      zoneId: resolvedZone,
      couponCode: coupon ? coupon.code : null,
      couponError,
    };
  } catch (err) {
    if (err instanceof PricingError && err.code === 'INVALID_COUPON') {
      const totals = computeTotals({ lines, shippingBaseFee: baseFee, freeOver });
      return {
        ...totals,
        itemCount: cart.count,
        zoneId: resolvedZone,
        couponCode: null,
        couponError: 'This code is not valid for your cart.',
      };
    }
    throw err;
  }
}
