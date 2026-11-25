'use server';

import { uuidSchema, type Database } from '@extramile/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getReviewEligibility } from './queries';
import {
  firstFieldErrors,
  parseReviewForm,
  type ReviewEligibility,
  type ReviewFormState,
} from './schema';

/** Called from the (ISR-cached) product page once it is in the browser. */
export async function reviewEligibilityAction(productId: string): Promise<ReviewEligibility> {
  const id = uuidSchema.safeParse(productId);
  if (!id.success) return { state: 'not-purchased' };
  return getReviewEligibility(id.data);
}

/**
 * Save a customer's review. It is stored unpublished; staff approve it in the back-office.
 * The database (RLS write_review + trigger reviews_fill_purchase) checks the delivered
 * purchase and sets order_id / is_verified_purchase — the browser never supplies those.
 */
export async function submitReviewAction(
  _prev: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const parsed = parseReviewForm(form);
  if (!parsed.success) {
    return {
      status: 'error',
      error: 'Please check the highlighted fields.',
      fieldErrors: firstFieldErrors(parsed.error.issues),
    };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', error: 'Sign in to write a review.' };

  // As this user (not service role) so RLS write_review checks the delivered purchase.
  // @supabase/ssr's client types resolve insert() to never here; it is the same client.
  const db = supabase as unknown as SupabaseClient<Database>;
  const { error } = await db.from('reviews').insert({
    product_id: input.productId,
    user_id: user.id,
    rating: input.rating,
    title: input.title,
    body: input.body,
  });
  if (error) {
    if (error.code === '23505')
      return { status: 'error', error: 'You have already reviewed this product.' };
    if (error.code === '42501')
      return {
        status: 'error',
        error: 'You can review a product once an order containing it has been delivered.',
      };
    return { status: 'error', error: 'Could not save your review. Please try again.' };
  }

  return { status: 'submitted' };
}
