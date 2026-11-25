/**
 * Refund arithmetic used by admin-actions `refund` (supabase/functions/_shared/refund-plan.ts).
 * Money rules (README rule 1): integer pesewas only; a refund never exceeds what is left.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planRefund } from '../../../../supabase/functions/_shared/refund-plan';

const runs = Number(process.env.FC_NUM_RUNS ?? 200);

describe('planRefund', () => {
  it('refunds everything left when no amount is given', () => {
    expect(planRefund(10_000, 0, null)).toEqual({
      ok: true,
      amount: 10_000,
      full: true,
      remainingAfter: 0,
    });
    expect(planRefund(10_000, 4_000, null)).toMatchObject({ ok: true, amount: 6_000, full: true });
  });

  it('a partial refund is not full; two partials that add up to the total are', () => {
    const first = planRefund(10_000, 0, 3_000);
    expect(first).toMatchObject({ ok: true, full: false, remainingAfter: 7_000 });
    expect(planRefund(10_000, 3_000, 7_000)).toMatchObject({ ok: true, full: true });
  });

  it('refuses amounts that are not positive whole pesewas, or more than is left', () => {
    expect(planRefund(10_000, 0, 0)).toEqual({ ok: false, error: 'invalid_amount' });
    expect(planRefund(10_000, 0, -5)).toEqual({ ok: false, error: 'invalid_amount' });
    expect(planRefund(10_000, 0, 12.5)).toEqual({ ok: false, error: 'invalid_amount' });
    expect(planRefund(10_000, 9_000, 1_001)).toEqual({
      ok: false,
      error: 'exceeds_remaining:1000',
    });
    expect(planRefund(10_000, 10_000, null)).toEqual({ ok: false, error: 'already_refunded' });
  });

  it('property: any sequence of accepted refunds never adds up to more than the total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000_000 }),
        fc.array(fc.option(fc.integer({ min: -1_000, max: 60_000_000 }), { nil: null }), {
          maxLength: 8,
        }),
        (total, requests) => {
          let refunded = 0;
          let wasFull = false;
          for (const req of requests) {
            const plan = planRefund(total, refunded, req);
            if (!plan.ok) continue;
            expect(wasFull).toBe(false); // nothing is accepted after a full refund
            expect(Number.isSafeInteger(plan.amount) && plan.amount > 0).toBe(true);
            refunded += plan.amount;
            expect(refunded).toBeLessThanOrEqual(total);
            expect(plan.remainingAfter).toBe(total - refunded);
            expect(plan.full).toBe(refunded === total);
            wasFull = plan.full;
          }
        },
      ),
      { numRuns: runs },
    );
  });
});
