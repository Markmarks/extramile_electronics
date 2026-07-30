/**
 * Pricing. Mirrors the authoritative `create_order` RPC in docs/02-DATA-MODEL.md §007
 * so the client can *display* totals identically — but the server value always wins.
 * Tests: U-02..U-08.
 */
import { assertPesewas, lineTotal, type Pesewas } from './money';

export type CouponKind = 'percent' | 'fixed' | 'free_shipping';

export interface CartLine {
  unitPrice: Pesewas;
  qty: number;
}

export interface Coupon {
  code: string;
  kind: CouponKind;
  /** percent points for `percent`; pesewas for `fixed`; ignored for `free_shipping`. */
  value: number;
  minSubtotal?: Pesewas;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxRedemptions?: number | null;
  redemptionCount?: number;
}

export interface Totals {
  subtotal: Pesewas;
  shipping: Pesewas;
  discount: Pesewas;
  total: Pesewas;
}

export class PricingError extends Error {
  constructor(
    public code: 'EMPTY_CART' | 'INVALID_COUPON' | 'INVALID_ZONE',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PricingError';
  }
}

export function subtotal(lines: CartLine[]): Pesewas {
  return assertPesewas(lines.reduce((sum, l) => sum + lineTotal(l.unitPrice, l.qty), 0));
}

/**
 * Zone shipping fee: free when a `freeOver` threshold is met exactly or exceeded (U-05),
 * otherwise the base fee.
 */
export function shippingFee(sub: Pesewas, baseFee: Pesewas, freeOver: Pesewas | null): Pesewas {
  if (freeOver !== null && sub >= freeOver) return 0;
  return baseFee;
}

function couponIsValid(sub: Pesewas, coupon: Coupon, now: Date): boolean {
  const active = coupon.isActive !== false;
  const meetsMin = sub >= (coupon.minSubtotal ?? 0);
  const started = !coupon.startsAt || now >= coupon.startsAt;
  const notEnded = !coupon.endsAt || now <= coupon.endsAt;
  const underCap =
    coupon.maxRedemptions == null || (coupon.redemptionCount ?? 0) < coupon.maxRedemptions;
  return active && meetsMin && started && notEnded && underCap;
}

export interface ComputeTotalsInput {
  lines: CartLine[];
  shippingBaseFee: Pesewas;
  freeOver?: Pesewas | null;
  coupon?: Coupon | null;
  now?: Date;
}

/**
 * Server-parity total computation. Integer division floors the percent discount
 * exactly as Postgres integer division does (U-02).
 */
export function computeTotals(input: ComputeTotalsInput): Totals {
  const now = input.now ?? new Date();
  const sub = subtotal(input.lines);
  if (sub <= 0) throw new PricingError('EMPTY_CART');

  let shipping = shippingFee(sub, input.shippingBaseFee, input.freeOver ?? null);
  let discount = 0;

  const coupon = input.coupon;
  if (coupon) {
    if (!couponIsValid(sub, coupon, now)) throw new PricingError('INVALID_COUPON');
    switch (coupon.kind) {
      case 'percent':
        discount = Math.floor((sub * coupon.value) / 100);
        break;
      case 'fixed':
        discount = Math.min(coupon.value, sub); // capped at subtotal (U-03)
        break;
      case 'free_shipping':
        shipping = 0;
        break;
    }
  }

  const total = Math.max(sub + shipping - discount, 0);
  return { subtotal: sub, shipping, discount, total };
}
