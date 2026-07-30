import { describe, expect, it } from 'vitest';
import { computeTotals, PricingError, shippingFee, subtotal, type Coupon } from '../src/pricing';

const lines = [{ unitPrice: 149999, qty: 1 }]; // GHS 1,499.99
const ACCRA_CENTRAL = 1500;

describe('pricing', () => {
  it('sums subtotal in pesewas', () => {
    expect(subtotal([{ unitPrice: 2999, qty: 3 }])).toBe(8997);
  });

  it('U-02: percent coupon 10% floors integer division', () => {
    const coupon: Coupon = { code: 'SAVE10', kind: 'percent', value: 10 };
    const t = computeTotals({ lines, shippingBaseFee: ACCRA_CENTRAL, coupon });
    expect(t.discount).toBe(14999); // floor(149999 * 10 / 100)
    expect(t.total).toBe(149999 + 1500 - 14999);
  });

  it('U-03: fixed coupon greater than subtotal is capped, total >= 0', () => {
    const coupon: Coupon = { code: 'BIG', kind: 'fixed', value: 999999 };
    const t = computeTotals({ lines, shippingBaseFee: ACCRA_CENTRAL, coupon });
    expect(t.discount).toBe(149999);
    expect(t.total).toBe(1500); // subtotal fully discounted, shipping remains
    expect(t.total).toBeGreaterThanOrEqual(0);
  });

  it('U-04: free-shipping coupon zeroes shipping, leaves subtotal', () => {
    const coupon: Coupon = { code: 'FREESHIP', kind: 'free_shipping', value: 0 };
    const t = computeTotals({ lines, shippingBaseFee: ACCRA_CENTRAL, coupon });
    expect(t.shipping).toBe(0);
    expect(t.subtotal).toBe(149999);
    expect(t.discount).toBe(0);
  });

  it('U-05: free-over threshold met exactly gives zero fee', () => {
    expect(shippingFee(50000, ACCRA_CENTRAL, 50000)).toBe(0);
    expect(shippingFee(49999, ACCRA_CENTRAL, 50000)).toBe(ACCRA_CENTRAL);
  });

  it('U-06: coupon below min_subtotal is rejected', () => {
    const coupon: Coupon = { code: 'MIN', kind: 'fixed', value: 1000, minSubtotal: 200000 };
    expect(() => computeTotals({ lines, shippingBaseFee: ACCRA_CENTRAL, coupon })).toThrow(
      PricingError,
    );
  });

  it('U-07: expired or not-yet-started coupon is rejected', () => {
    const now = new Date('2026-07-29T12:00:00Z');
    const expired: Coupon = {
      code: 'OLD',
      kind: 'percent',
      value: 10,
      endsAt: new Date('2026-01-01T00:00:00Z'),
    };
    const future: Coupon = {
      code: 'SOON',
      kind: 'percent',
      value: 10,
      startsAt: new Date('2026-12-01T00:00:00Z'),
    };
    expect(() =>
      computeTotals({ lines, shippingBaseFee: ACCRA_CENTRAL, coupon: expired, now }),
    ).toThrow(PricingError);
    expect(() =>
      computeTotals({ lines, shippingBaseFee: ACCRA_CENTRAL, coupon: future, now }),
    ).toThrow(PricingError);
  });

  it('U-08: coupon at max_redemptions is rejected', () => {
    const coupon: Coupon = {
      code: 'CAP',
      kind: 'percent',
      value: 10,
      maxRedemptions: 5,
      redemptionCount: 5,
    };
    expect(() => computeTotals({ lines, shippingBaseFee: ACCRA_CENTRAL, coupon })).toThrow(
      PricingError,
    );
  });

  it('empty cart is rejected', () => {
    expect(() => computeTotals({ lines: [], shippingBaseFee: ACCRA_CENTRAL })).toThrow(
      /EMPTY_CART/,
    );
  });
});
