/**
 * Money. All amounts are integer **pesewas** (100 pesewas = GHS 1).
 * Never floats, never client-supplied for authority. See docs/01-PRD.md §5 and
 * the non-negotiable rules in docs/06-BUILD-PROMPTS.md P0.
 */

/** An integer number of pesewas. */
export type Pesewas = number;

export function isPesewas(n: number): boolean {
  return Number.isInteger(n) && Number.isSafeInteger(n);
}

/** Throws unless `n` is a safe integer number of pesewas. */
export function assertPesewas(n: number): Pesewas {
  if (!isPesewas(n)) {
    throw new RangeError(`Amount must be a safe integer number of pesewas, got ${n}`);
  }
  return n;
}

/**
 * Line total in pesewas. Pure integer arithmetic — no float drift.
 * U-01: `2999 × 3 === 8997`.
 */
export function lineTotal(unitPrice: Pesewas, qty: number): Pesewas {
  if (!Number.isInteger(unitPrice) || unitPrice < 0) {
    throw new RangeError('unitPrice must be a non-negative integer (pesewas)');
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new RangeError('qty must be a positive integer');
  }
  return assertPesewas(unitPrice * qty);
}

const ghsGrouping = new Intl.NumberFormat('en-GH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format pesewas as Ghana cedis for display.
 * U-10: `8997 → "GH₵ 89.97"`; never `"GH₵ 89.969999"`.
 */
export function formatGHS(pesewas: Pesewas): string {
  assertPesewas(pesewas);
  const sign = pesewas < 0 ? '-' : '';
  const cedis = Math.abs(pesewas) / 100;
  return `${sign}GH₵ ${ghsGrouping.format(cedis)}`;
}

/** Convert pesewas to a plain cedis number — for display/formatting only, never for math. */
export function pesewasToCedis(pesewas: Pesewas): number {
  return assertPesewas(pesewas) / 100;
}

/** Convert a cedis amount (e.g. from a CSV) to integer pesewas, rounding to the nearest pesewa. */
export function cedisToPesewas(cedis: number): Pesewas {
  return assertPesewas(Math.round(cedis * 100));
}
