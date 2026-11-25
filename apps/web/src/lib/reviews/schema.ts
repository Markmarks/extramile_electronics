import { uuidSchema } from '@extramile/core';
import { z } from 'zod';

/** Same limits as the reviews_title_check / reviews_body_check constraints (body tighter). */
export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MAX = 2000;
const PICK_RATING = 'Pick a rating from 1 to 5 stars.';

const text = (min: number, max: number, what: string) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(min, `${what} needs at least ${min} characters.`)
        .max(max, `${what} can be at most ${max} characters.`),
    );

/**
 * What a customer may send when writing a review. Who wrote it, whether it is a verified
 * purchase and whether it is published are never part of the input — the server and the
 * database decide those (migration 20261125000003).
 */
export const reviewInputSchema = z.object({
  productId: uuidSchema,
  rating: z.coerce
    .number({ error: PICK_RATING })
    .int(PICK_RATING)
    .min(1, PICK_RATING)
    .max(5, PICK_RATING),
  title: text(2, REVIEW_TITLE_MAX, 'The title'),
  body: z
    .string()
    .transform((s) => s.replace(/\r\n/g, '\n').trim())
    .pipe(
      z
        .string()
        .min(10, 'Tell other buyers a little more (at least 10 characters).')
        .max(REVIEW_BODY_MAX, `Keep the review under ${REVIEW_BODY_MAX} characters.`),
    ),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

export type ReviewFormState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Partial<Record<keyof ReviewInput, string>> }
  | { status: 'submitted' };

/** What the product page shows the visitor about writing a review. */
export type ReviewEligibility =
  | { state: 'signed-out' }
  | { state: 'not-purchased' }
  | { state: 'eligible' }
  | { state: 'reviewed'; published: boolean };

/** Mean rating to one decimal, like refresh_product_rating() in the database. */
export function averageRating(reviews: readonly { rating: number }[]): number {
  if (reviews.length === 0) return 0;
  // (sum·10)/n keeps exact halves exact, so x.x5 rounds up as Postgres round() does.
  return Math.round((reviews.reduce((s, r) => s + r.rating, 0) * 10) / reviews.length) / 10;
}

export function parseReviewForm(form: FormData) {
  return reviewInputSchema.safeParse({
    productId: form.get('productId'),
    rating: form.get('rating'),
    title: form.get('title') ?? '',
    body: form.get('body') ?? '',
  });
}

export function firstFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Partial<Record<keyof ReviewInput, string>> {
  const out: Partial<Record<keyof ReviewInput, string>> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if ((key === 'productId' || key === 'rating' || key === 'title' || key === 'body') && !out[key])
      out[key] = issue.message;
  }
  return out;
}
