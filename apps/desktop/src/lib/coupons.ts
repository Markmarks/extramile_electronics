import { supabase } from './supabase';

/**
 * Discount codes. create_order() validates and applies them in Postgres (README rule 4);
 * this screen only edits the rules it reads. Admin-only writes (RLS); the code and the
 * redemption counter can't be changed from the app (column grants, migration
 * 20261125000002).
 */
export type CouponKind = 'percent' | 'fixed' | 'free_shipping';

export interface Coupon {
  id: string;
  code: string;
  kind: CouponKind;
  /** percent: whole percent 1–100 · fixed: pesewas · free_shipping: 0 */
  value: number;
  min_subtotal: number; // pesewas
  max_redemptions: number | null;
  per_user_limit: number;
  redemption_count: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

export type CouponInput = Omit<Coupon, 'id' | 'redemption_count'>;

export const KIND_LABELS: Record<CouponKind, string> = {
  percent: '% off',
  fixed: 'Amount off',
  free_shipping: 'Free delivery',
};

const NOT_SAVED = 'Not saved — only an admin can change coupons.';

export async function listCoupons(): Promise<Coupon[]> {
  const { data } = await supabase
    .from('coupons')
    .select(
      'id, code, kind, value, min_subtotal, max_redemptions, per_user_limit, redemption_count, starts_at, ends_at, is_active',
    )
    .order('code')
    .returns<Coupon[]>();
  return data ?? [];
}

export async function createCoupon(c: CouponInput): Promise<void> {
  const { error } = await supabase.from('coupons').insert({ ...c, code: normalizeCode(c.code) });
  if (error) throw new Error(friendly(error.message));
}

export async function updateCoupon(id: string, c: Omit<CouponInput, 'code'>): Promise<void> {
  const { data, error } = await supabase.from('coupons').update(c).eq('id', id).select('id');
  if (error) throw new Error(friendly(error.message));
  if (!data?.length) throw new Error(NOT_SAVED);
}

/** Codes are stored upper-case: A–Z, 0–9, _ and -, 3–40 characters. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/** Is the coupon usable right now (ignoring the per-order minimum)? */
export function couponState(
  c: Coupon,
  now = Date.now(),
): 'live' | 'off' | 'scheduled' | 'ended' | 'used up' {
  if (!c.is_active) return 'off';
  if (c.starts_at && Date.parse(c.starts_at) > now) return 'scheduled';
  if (c.ends_at && Date.parse(c.ends_at) < now) return 'ended';
  if (c.max_redemptions !== null && c.redemption_count >= c.max_redemptions) return 'used up';
  return 'live';
}

function friendly(msg: string): string {
  if (/row-level security|permission denied/.test(msg)) return NOT_SAVED;
  if (/coupons_code_key|duplicate key/.test(msg)) return 'A coupon with that code already exists.';
  if (/coupons_code_check/.test(msg)) return 'Code: 3–40 letters, numbers, - or _ (no spaces).';
  if (/coupons_value_check/.test(msg))
    return 'Percent must be 1–100; an amount off must be above GH₵ 0.';
  if (/coupons_window_check/.test(msg)) return 'The end date must be after the start date.';
  if (/coupons_per_user_check/.test(msg)) return 'Uses per customer must be at least 1.';
  if (/coupons_max_redemptions_check/.test(msg)) return 'Total uses must be at least 1 (or blank).';
  return msg;
}
