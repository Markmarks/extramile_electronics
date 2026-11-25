/**
 * Refund arithmetic for admin-actions `refund`, kept pure (no Deno / Supabase APIs) so
 * it can be unit- and property-tested from the web workspace
 * (apps/web/tests/unit/refund-plan.test.ts). All amounts are integer pesewas.
 */
export type RefundPlan =
  | { ok: true; amount: number; full: boolean; remainingAfter: number }
  | { ok: false; error: 'already_refunded' | 'invalid_amount' | `exceeds_remaining:${number}` };

/**
 * @param total            the order total
 * @param alreadyRefunded  sum of earlier refunds on this order
 * @param requested        amount to refund now; null = everything still refundable
 */
export function planRefund(
  total: number,
  alreadyRefunded: number,
  requested: number | null,
): RefundPlan {
  const remaining = total - alreadyRefunded;
  if (remaining <= 0) return { ok: false, error: 'already_refunded' };
  const amount = requested ?? remaining;
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: 'invalid_amount' };
  if (amount > remaining) return { ok: false, error: `exceeds_remaining:${remaining}` };
  return { ok: true, amount, full: amount === remaining, remainingAfter: remaining - amount };
}
