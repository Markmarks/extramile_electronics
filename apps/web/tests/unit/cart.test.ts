import { describe, expect, it } from 'vitest';
import { clampQty, MAX_QTY } from '../../src/lib/cart/qty';

describe('U-09: cart quantity clamp', () => {
  it('caps at MAX_QTY (20)', () => {
    expect(clampQty(50, 100)).toBe(MAX_QTY);
    expect(clampQty(21, 100)).toBe(20);
  });

  it('caps at available stock', () => {
    expect(clampQty(10, 3)).toBe(3);
    expect(clampQty(5, 5)).toBe(5);
  });

  it('floors at zero for non-positive or no stock', () => {
    expect(clampQty(-5, 10)).toBe(0);
    expect(clampQty(5, 0)).toBe(0);
    expect(clampQty(0, 10)).toBe(0);
  });

  it('floors fractional requests', () => {
    expect(clampQty(2.9, 10)).toBe(2);
  });
});
