/// <reference types="node" /> // the tests (not src) use process.env and Buffer
/**
 * Property tests: rules that must hold for *every* input, not just the hand-picked
 * examples in the other test files. fast-check generates the inputs and shrinks any
 * counter-example to the smallest one. Re-run a failure with the `seed`/`path` it prints:
 *   fc.assert(prop, { seed: <seed>, path: '<path>' })
 * Set FC_NUM_RUNS (e.g. 10000) for a deeper soak; the default keeps `pnpm test` fast.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isValidImei, luhnValid } from '../src/imei';
import { parseCedisText, parseCsv, toCsv } from '../src/csv';
import { cedisToPesewas, formatGHS, lineTotal, pesewasToCedis } from '../src/money';
import { InvalidMsisdnError, isValidMsisdn, normalizeMsisdn } from '../src/msisdn';
import { generateOrderNumber, ORDER_NUMBER_RE } from '../src/order-number';
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isTerminal,
  nextStatuses,
  STAFF_FULFILMENT_FLOW,
  type OrderStatus,
} from '../src/order-state';
import { computeTotals, PricingError, subtotal, type CartLine, type Coupon } from '../src/pricing';

fc.configureGlobal({ numRuns: Number(process.env.FC_NUM_RUNS ?? 500) });

// ── Arbitraries ────────────────────────────────────────────────────────────────
/** Realistic money: up to GH₵ 10 billion, well inside float-exact range for /100. */
const pesewas = fc.integer({ min: 0, max: 1_000_000_000_000 });
const signedPesewas = fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 });
const cartLine: fc.Arbitrary<CartLine> = fc.record({
  unitPrice: fc.integer({ min: 0, max: 50_000_000 }), // ≤ GH₵ 500k per item
  qty: fc.integer({ min: 1, max: 1_000 }),
});
const nonEmptyCart = fc.array(cartLine, { minLength: 1, maxLength: 20 });
const nsn = fc
  .tuple(fc.integer({ min: 1, max: 9 }), fc.stringMatching(/^\d{8}$/))
  .map(([first, rest]) => `${first}${rest}`);
const ALL_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'packed',
  'dispatched',
  'delivered',
  'cancelled',
  'refunded',
  'oversold',
];
const status = fc.constantFrom(...ALL_STATUSES);

/** Naive Luhn oracle written independently of the implementation under test. */
function luhnOracle(digits: string): boolean {
  const sum = digits
    .split('')
    .reverse()
    .map(Number)
    .map((d, i) => (i % 2 === 1 ? [...String(d * 2)].reduce((a, c) => a + Number(c), 0) : d))
    .reduce((a, b) => a + b, 0);
  return sum % 10 === 0;
}
function luhnCheckDigit(body: string): string {
  for (let c = 0; c <= 9; c++) if (luhnOracle(body + c)) return String(c);
  throw new Error('unreachable');
}

// ── Money ──────────────────────────────────────────────────────────────────────
describe('money properties', () => {
  it('pesewas → cedis → pesewas round-trips exactly', () => {
    fc.assert(fc.property(signedPesewas, (p) => cedisToPesewas(pesewasToCedis(p)) === p));
  });

  it('formatGHS output parses back to the same amount (no float drift)', () => {
    fc.assert(
      fc.property(signedPesewas, (p) => {
        const s = formatGHS(p);
        expect(s).toMatch(/^-?GH₵ \d{1,3}(,\d{3})*\.\d{2}$/);
        const parsed = Math.round(Number(s.replace(/GH₵ |,/g, '')) * 100);
        return parsed === p;
      }),
    );
  });

  it('lineTotal equals exact integer multiplication and is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (u, q) => {
          const t = lineTotal(u, q);
          return Number.isSafeInteger(t) && t === u * q && t >= 0;
        },
      ),
    );
  });

  it('lineTotal rejects non-integer or non-positive quantities', () => {
    fc.assert(
      fc.property(
        pesewas,
        fc.oneof(fc.integer({ max: 0 }), fc.double({ noInteger: true, noNaN: true })),
        (u, q) => {
          expect(() => lineTotal(u, q)).toThrow(RangeError);
        },
      ),
    );
  });
});

// ── Pricing ────────────────────────────────────────────────────────────────────
const coupon: fc.Arbitrary<Coupon> = fc.oneof(
  fc.record({
    code: fc.constant('PCT'),
    kind: fc.constant('percent' as const),
    value: fc.integer({ min: 0, max: 100 }),
  }),
  fc.record({
    code: fc.constant('FIX'),
    kind: fc.constant('fixed' as const),
    value: fc.integer({ min: 0, max: 100_000_000 }),
  }),
  fc.record({
    code: fc.constant('SHIP'),
    kind: fc.constant('free_shipping' as const),
    value: fc.constant(0),
  }),
);

describe('pricing properties', () => {
  it('subtotal is additive: subtotal(a ++ b) = subtotal(a) + subtotal(b)', () => {
    fc.assert(
      fc.property(
        fc.array(cartLine),
        fc.array(cartLine),
        (a, b) => subtotal([...a, ...b]) === subtotal(a) + subtotal(b),
      ),
    );
  });

  it('subtotal does not depend on line order', () => {
    fc.assert(
      fc.property(nonEmptyCart, (lines) => subtotal(lines) === subtotal([...lines].reverse())),
    );
  });

  it('totals invariants hold for any cart, zone and valid coupon', () => {
    fc.assert(
      fc.property(
        nonEmptyCart,
        fc.integer({ min: 0, max: 10_000 }),
        fc.option(pesewas, { nil: null }),
        fc.option(coupon, { nil: null }),
        (lines, baseFee, freeOver, c) => {
          const sub = subtotal(lines);
          fc.pre(sub > 0);
          const t = computeTotals({ lines, shippingBaseFee: baseFee, freeOver, coupon: c });
          expect(t.subtotal).toBe(sub);
          expect(t.discount).toBeGreaterThanOrEqual(0);
          expect(t.discount).toBeLessThanOrEqual(t.subtotal); // a discount never exceeds the goods
          expect(t.shipping).toBeGreaterThanOrEqual(0);
          expect(t.shipping).toBeLessThanOrEqual(baseFee);
          expect(t.total).toBeGreaterThanOrEqual(0); // never a negative charge
          expect(t.total).toBe(t.subtotal + t.shipping - t.discount);
          for (const v of Object.values(t)) expect(Number.isSafeInteger(v)).toBe(true);
          if (freeOver !== null && sub >= freeOver) expect(t.shipping).toBe(0);
          if (c?.kind === 'percent') expect(t.discount).toBe(Math.floor((sub * c.value) / 100));
        },
      ),
    );
  });

  it('a bigger percent coupon never costs the customer more', () => {
    fc.assert(
      fc.property(
        nonEmptyCart,
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (lines, p1, p2) => {
          fc.pre(subtotal(lines) > 0);
          const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
          const at = (value: number) =>
            computeTotals({
              lines,
              shippingBaseFee: 0,
              coupon: { code: 'P', kind: 'percent', value },
            }).total;
          return at(hi) <= at(lo);
        },
      ),
    );
  });

  it('an empty or zero-value cart is rejected, never priced', () => {
    fc.assert(
      fc.property(fc.array(cartLine.map((l) => ({ ...l, unitPrice: 0 }))), (lines) => {
        expect(() => computeTotals({ lines, shippingBaseFee: 500 })).toThrow(PricingError);
      }),
    );
  });

  it('expired, not-yet-started, inactive or capped coupons are always refused', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const bad = fc.constantFrom<Partial<Coupon>>(
      { endsAt: new Date('2026-05-31T23:59:59Z') },
      { startsAt: new Date('2026-06-01T00:00:01Z') },
      { isActive: false },
      { maxRedemptions: 5, redemptionCount: 5 },
    );
    fc.assert(
      fc.property(nonEmptyCart, coupon, bad, (lines, c, override) => {
        fc.pre(subtotal(lines) > 0);
        expect(() =>
          computeTotals({ lines, shippingBaseFee: 0, coupon: { ...c, ...override }, now }),
        ).toThrow(PricingError);
      }),
    );
  });
});

// ── MSISDN ─────────────────────────────────────────────────────────────────────
describe('MSISDN properties', () => {
  it('every accepted spelling of a number normalises to the same E.164 value', () => {
    fc.assert(
      fc.property(nsn, (n) => {
        const forms = [
          `0${n}`,
          n,
          `233${n}`,
          `+233${n}`,
          `+233 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`,
          `0${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`,
          `(0${n.slice(0, 2)}) ${n.slice(2)}`,
        ];
        return forms.every((f) => normalizeMsisdn(f) === `+233${n}`);
      }),
    );
  });

  it('normalisation is idempotent', () => {
    fc.assert(
      fc.property(
        nsn,
        (n) => normalizeMsisdn(normalizeMsisdn(`0${n}`)) === normalizeMsisdn(`0${n}`),
      ),
    );
  });

  it('arbitrary input either throws InvalidMsisdnError or yields a well-formed number', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.stringMatching(/^[+\d\s()-]{0,16}$/)), (s) => {
        try {
          expect(normalizeMsisdn(s)).toMatch(/^\+233[1-9]\d{8}$/);
          expect(isValidMsisdn(s)).toBe(true);
        } catch (e) {
          if (!(e instanceof InvalidMsisdnError)) throw e;
          expect(isValidMsisdn(s)).toBe(false);
        }
      }),
    );
  });
});

// ── IMEI / Luhn ────────────────────────────────────────────────────────────────
describe('IMEI properties', () => {
  it('luhnValid agrees with an independent naive oracle', () => {
    fc.assert(fc.property(fc.stringMatching(/^\d{1,30}$/), (d) => luhnValid(d) === luhnOracle(d)));
  });

  it('a 14-digit body plus its check digit is always a valid IMEI', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\d{14}$/), (body) =>
        isValidImei(body + luhnCheckDigit(body)),
      ),
    );
  });

  it('any single-digit typo in a valid IMEI is detected', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{14}$/),
        fc.integer({ min: 0, max: 14 }),
        fc.integer({ min: 1, max: 9 }),
        (body, pos, delta) => {
          const imei = body + luhnCheckDigit(body);
          const typo =
            imei.slice(0, pos) + ((Number(imei[pos]) + delta) % 10) + imei.slice(pos + 1);
          return !isValidImei(typo);
        },
      ),
    );
  });

  it('separators are ignored and wrong lengths are rejected', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\d{14}$/), (body) => {
        const imei = body + luhnCheckDigit(body);
        expect(isValidImei(`${imei.slice(0, 2)}-${imei.slice(2, 8)} ${imei.slice(8)}`)).toBe(true);
        expect(isValidImei(imei.slice(1))).toBe(false);
        expect(isValidImei(`${imei}0`)).toBe(false);
      }),
    );
  });
});

// ── Order number ───────────────────────────────────────────────────────────────
describe('order-number properties', () => {
  it('always matches the RPC format and encodes the UTC date', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2000-01-01T00:00:00Z'),
          max: new Date('2099-12-31T23:59:59Z'),
          noInvalidDate: true,
        }),
        fc.uint8Array({ minLength: 3, maxLength: 3 }),
        (date, bytes) => {
          const n = generateOrderNumber(date, () => bytes);
          expect(n).toMatch(ORDER_NUMBER_RE);
          expect(n.slice(3, 11)).toBe(date.toISOString().slice(0, 10).replace(/-/g, ''));
          expect(n.slice(12)).toBe(Buffer.from(bytes).toString('hex').toUpperCase());
        },
      ),
    );
  });
});

// ── Order state machine (model-based) ──────────────────────────────────────────
describe('order-state properties', () => {
  it('assertTransition throws exactly when canTransition is false', () => {
    fc.assert(
      fc.property(status, status, (from, to) => {
        if (canTransition(from, to)) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
      }),
    );
  });

  it('no state transitions to itself, and terminal states are final', () => {
    fc.assert(
      fc.property(status, status, (from, to) => {
        expect(canTransition(from, from)).toBe(false);
        if (isTerminal(from)) expect(canTransition(from, to)).toBe(false);
      }),
    );
  });

  it('random walks from pending never revisit a state and always end terminal', () => {
    // Model: follow random legal transitions; the machine must be acyclic, so a walk is
    // bounded by the number of states and must finish in cancelled or refunded.
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: ALL_STATUSES.length, maxLength: ALL_STATUSES.length }),
        (choices) => {
          let s: OrderStatus = 'pending';
          const seen = new Set<OrderStatus>([s]);
          for (const c of choices) {
            const next = nextStatuses(s);
            if (next.length === 0) break;
            s = next[c % next.length]!;
            expect(seen.has(s)).toBe(false);
            seen.add(s);
          }
          expect(isTerminal(s)).toBe(true);
          expect(['cancelled', 'refunded']).toContain(s);
        },
      ),
    );
  });

  it('every state is reachable from pending, and the staff flow is a legal chain', () => {
    const reach = new Set<OrderStatus>(['pending']);
    const queue: OrderStatus[] = ['pending'];
    while (queue.length) {
      for (const n of nextStatuses(queue.shift()!)) {
        if (!reach.has(n)) {
          reach.add(n);
          queue.push(n);
        }
      }
    }
    expect([...reach].sort()).toEqual([...ALL_STATUSES].sort());
    const chain: OrderStatus[] = ['pending', ...STAFF_FULFILMENT_FLOW];
    for (let i = 1; i < chain.length; i++)
      expect(canTransition(chain[i - 1]!, chain[i]!)).toBe(true);
  });
});

// ── CSV (back-office export / import) ─────────────────────────────────────────
describe('csv properties', () => {
  /** Any text cell that isn't formula-like (those are deliberately prefixed on export). */
  const cell = fc
    .string({ unit: 'grapheme', maxLength: 30 })
    .filter((s) => !/^[=+\-@\t\r]/.test(s));
  const row = fc
    .array(cell, { minLength: 1, maxLength: 8 })
    .filter((r) => !(r.length === 1 && r[0] === ''));

  it('parseCsv(toCsv(rows)) returns the same rows — commas, quotes and newlines included', () => {
    fc.assert(
      fc.property(fc.array(row, { maxLength: 20 }), (rows) => {
        expect(parseCsv(toCsv(rows))).toEqual(rows);
      }),
    );
  });

  it('formula-like text is exported as inert text (CSV injection)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('=', '+', '-', '@'),
        fc.string({ maxLength: 20 }),
        (lead, rest) => {
          const [[out]] = parseCsv(toCsv([[lead + rest]])) as [[string]];
          expect(out.startsWith(`'${lead}`)).toBe(true);
        },
      ),
    );
  });

  it('parseCedisText reads back every amount the back-office formats', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000_000 }), (p) => {
        expect(parseCedisText(formatGHS(p))).toBe(p);
        expect(parseCedisText((p / 100).toFixed(2))).toBe(p);
      }),
    );
  });

  it('parseCedisText only ever yields a non-negative safe integer, or null', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (s) => {
        const p = parseCedisText(s);
        return p === null || (Number.isSafeInteger(p) && p >= 0);
      }),
    );
    for (const bad of ['-5', '1.234', '1e3', '', 'abc', '12.', '.5', 'NaN'])
      expect(parseCedisText(bad)).toBeNull();
  });
});
