import { describe, expect, it } from 'vitest';
import { cedisToPesewas, formatGHS, lineTotal, pesewasToCedis } from '../src/money';

describe('money', () => {
  it('U-01: line total is exact integer pesewas, no float drift', () => {
    expect(lineTotal(2999, 3)).toBe(8997);
    expect(lineTotal(149999, 7)).toBe(1049993);
  });

  it('rejects non-integer or non-positive inputs', () => {
    expect(() => lineTotal(2999.5, 1)).toThrow();
    expect(() => lineTotal(2999, 0)).toThrow();
    expect(() => lineTotal(2999, -1)).toThrow();
  });

  it('U-10: formats pesewas as GH₵ with two decimals, no float artefacts', () => {
    expect(formatGHS(8997)).toBe('GH₵ 89.97');
    expect(formatGHS(0)).toBe('GH₵ 0.00');
    expect(formatGHS(149999)).toBe('GH₵ 1,499.99');
    expect(formatGHS(100)).toBe('GH₵ 1.00');
    expect(formatGHS(-8997)).toBe('-GH₵ 89.97');
  });

  it('round-trips cedis and pesewas', () => {
    expect(cedisToPesewas(89.97)).toBe(8997);
    expect(pesewasToCedis(8997)).toBe(89.97);
  });
});
