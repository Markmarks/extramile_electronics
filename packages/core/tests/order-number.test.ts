import { describe, expect, it } from 'vitest';
import { generateOrderNumber, ORDER_NUMBER_RE } from '../src/order-number';

describe('U-12: order number generator', () => {
  it('matches the required format', () => {
    const n = generateOrderNumber(new Date('2026-07-29T09:00:00Z'));
    expect(n).toMatch(ORDER_NUMBER_RE);
    expect(n.startsWith('EL-20260729-')).toBe(true);
  });

  it('yields 10k unique numbers under the DB unique constraint (retry on clash)', () => {
    // The suffix is a fixed 6 hex chars (24 bits) per the RPC, so within a single
    // day the raw generator can birthday-collide a few times over 10k draws.
    // True uniqueness is guaranteed by the orders.order_number UNIQUE index; the
    // create_order RPC retries on a unique violation. Simulate that here.
    const seen = new Set<string>();
    let retries = 0;
    for (let i = 0; i < 10_000; i++) {
      let n = generateOrderNumber();
      while (seen.has(n)) {
        retries++;
        n = generateOrderNumber();
      }
      expect(n).toMatch(ORDER_NUMBER_RE);
      seen.add(n);
    }
    expect(seen.size).toBe(10_000);
    // Entropy is good enough that retries stay rare (cheap DB retry path).
    expect(retries).toBeLessThan(50);
  });
});
