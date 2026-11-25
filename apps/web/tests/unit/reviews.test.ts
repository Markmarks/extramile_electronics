import { describe, expect, it } from 'vitest';
import {
  averageRating,
  firstFieldErrors,
  parseReviewForm,
  REVIEW_BODY_MAX,
  REVIEW_TITLE_MAX,
  reviewInputSchema,
} from '@/lib/reviews/schema';

const PRODUCT = '11111111-1111-4111-8111-111111111111';

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const valid = {
  productId: PRODUCT,
  rating: '4',
  title: '  Great   phone ',
  body: 'Battery lasts all day.\r\nCamera is sharp.  ',
};

describe('review input (README rule 7: Zod on every server input)', () => {
  it('accepts a normal review and normalises whitespace', () => {
    const r = parseReviewForm(form(valid));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toEqual({
      productId: PRODUCT,
      rating: 4,
      title: 'Great phone',
      body: 'Battery lasts all day.\nCamera is sharp.',
    });
  });

  it('drops anything the browser should not decide (publish, verified, order, user)', () => {
    const r = reviewInputSchema.safeParse({
      ...valid,
      is_published: true,
      is_verified_purchase: true,
      order_id: PRODUCT,
      user_id: PRODUCT,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(Object.keys(r.data).sort()).toEqual(['body', 'productId', 'rating', 'title']);
  });

  it.each(['0', '6', '3.5', 'five', ''])('rejects rating %j', (rating) => {
    const r = parseReviewForm(form({ ...valid, rating }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(firstFieldErrors(r.error.issues).rating).toMatch(/1 to 5/);
  });

  it('rejects a missing rating (no star picked)', () => {
    const { rating: _omit, ...rest } = valid;
    const r = parseReviewForm(form(rest));
    expect(r.success).toBe(false);
  });

  it('rejects a bad product id', () => {
    expect(parseReviewForm(form({ ...valid, productId: 'demo-iphone' })).success).toBe(false);
  });

  it('enforces title and body lengths after trimming', () => {
    const cases: [Partial<typeof valid>, 'title' | 'body'][] = [
      [{ title: '   a   ' }, 'title'],
      [{ title: 'x'.repeat(REVIEW_TITLE_MAX + 1) }, 'title'],
      [{ body: '   too short   ' }, 'body'],
      [{ body: 'x'.repeat(REVIEW_BODY_MAX + 1) }, 'body'],
    ];
    for (const [patch, field] of cases) {
      const r = parseReviewForm(form({ ...valid, ...patch }));
      expect(r.success, JSON.stringify(patch).slice(0, 40)).toBe(false);
      if (r.success) continue;
      const errs = firstFieldErrors(r.error.issues);
      expect(Object.keys(errs)).toEqual([field]);
    }
    expect(
      parseReviewForm(
        form({ ...valid, title: 'x'.repeat(REVIEW_TITLE_MAX), body: 'y'.repeat(REVIEW_BODY_MAX) }),
      ).success,
    ).toBe(true);
  });
});

describe('averageRating matches Postgres round(avg(rating), 1)', () => {
  /** Exact oracle: round half away from zero on the rational sum/n, in integers. */
  const oracle = (rs: number[]) => {
    const sum = rs.reduce((a, b) => a + b, 0);
    // tenths = floor((20·sum + n) / (2n)) == round-half-up of 10·sum/n for positive values
    return Math.floor((20 * sum + rs.length) / (2 * rs.length)) / 10;
  };

  it('is 0 for no reviews', () => {
    expect(averageRating([])).toBe(0);
  });

  it('rounds exact halves up, like Postgres', () => {
    // 4.45 = 89/20 and 4.25 = 17/4: binary floats would round these down via sum/n·10
    expect(averageRating([5, 4, 4, 4].map((rating) => ({ rating })))).toBe(4.3);
    const nineFivesElevenFours = [...Array<number>(9).fill(5), ...Array<number>(11).fill(4)];
    expect(averageRating(nineFivesElevenFours.map((rating) => ({ rating })))).toBe(4.5);
  });

  it('agrees with the exact oracle on 5,000 random review sets', () => {
    let seed = 0x5eed;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x80000000;
    };
    for (let k = 0; k < 5000; k++) {
      const n = 1 + Math.floor(rand() * 60);
      const rs = Array.from({ length: n }, () => 1 + Math.floor(rand() * 5));
      expect(averageRating(rs.map((rating) => ({ rating }))), rs.join(',')).toBe(oracle(rs));
    }
  });
});
