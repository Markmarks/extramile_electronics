import 'server-only';

import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';
import { averageRating, type ReviewEligibility } from './schema';

export interface PublishedReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verified: boolean;
  createdAt: string;
}

export interface ReviewSummary {
  /** Mean of every published rating, one decimal; 0 when there are none. */
  average: number;
  count: number;
  /** The newest published reviews (at most `limit`). */
  latest: PublishedReview[];
}

/**
 * Published reviews for a product: rating summary plus the newest few. Uses the cookie-free anon client so the
 * product page stays ISR-cacheable; RLS (pub_read_rev) returns published rows only.
 * Reviewer names are not shown: profiles are private to their owner.
 */
export async function getReviewSummary(productId: string, limit = 20): Promise<ReviewSummary> {
  const supabase = createPublicClient();
  const ratings = supabase
    .from('reviews')
    .select('rating')
    .eq('product_id', productId)
    .eq('is_published', true)
    .returns<{ rating: number }[]>();
  const latest = supabase
    .from('reviews')
    .select('id, rating, title, body, is_verified_purchase, created_at')
    .eq('product_id', productId)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<
      {
        id: string;
        rating: number;
        title: string | null;
        body: string | null;
        is_verified_purchase: boolean;
        created_at: string;
      }[]
    >();
  const [all, page] = await Promise.all([ratings, latest]);
  if (all.error) throw new Error(all.error.message);
  if (page.error) throw new Error(page.error.message);
  const every = all.data ?? [];
  return {
    average: averageRating(every),
    count: every.length,
    latest: (page.data ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verified: r.is_verified_purchase,
      createdAt: r.created_at,
    })),
  };
}

/** Whether the signed-in visitor may review this product (mirrors RLS write_review). */
export async function getReviewEligibility(productId: string): Promise<ReviewEligibility> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: 'signed-out' };

  const [own, bought] = await Promise.all([
    supabase
      .from('reviews')
      .select('is_published')
      .eq('product_id', productId)
      .eq('user_id', user.id)
      .limit(1)
      .returns<{ is_published: boolean }[]>(),
    hasDeliveredPurchase(user.id, [productId]),
  ]);
  const mine = own.data?.[0];
  if (mine) return { state: 'reviewed', published: mine.is_published };
  return bought.has(productId) ? { state: 'eligible' } : { state: 'not-purchased' };
}

/** Of `productIds`, those the user has received in a delivered order. */
export async function hasDeliveredPurchase(
  userId: string,
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from('order_items')
    .select('orders!inner(user_id, status), product_variants!inner(product_id)')
    .eq('orders.user_id', userId)
    .eq('orders.status', 'delivered')
    .in('product_variants.product_id', productIds)
    .returns<{ product_variants: { product_id: string } }[]>();
  return new Set((data ?? []).map((r) => r.product_variants.product_id));
}

export interface ReviewableItem {
  productId: string;
  slug: string;
  reviewed: boolean;
  published: boolean;
}

/**
 * For a delivered order's line items (by variant id): the product to review, its page and
 * whether the signed-in customer already reviewed it.
 */
export async function getReviewableItems(
  variantIds: string[],
): Promise<Map<string, ReviewableItem>> {
  const out = new Map<string, ReviewableItem>();
  if (variantIds.length === 0) return out;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return out;

  const { data: variants } = await supabase
    .from('product_variants')
    .select('id, product_id, products!inner(slug)')
    .in('id', variantIds)
    .returns<{ id: string; product_id: string; products: { slug: string } }[]>();
  const productIds = [...new Set((variants ?? []).map((v) => v.product_id))];
  if (productIds.length === 0) return out;

  const { data: mine } = await supabase
    .from('reviews')
    .select('product_id, is_published')
    .eq('user_id', user.id)
    .in('product_id', productIds)
    .returns<{ product_id: string; is_published: boolean }[]>();
  const reviewed = new Map((mine ?? []).map((r) => [r.product_id, r.is_published]));

  for (const v of variants ?? []) {
    out.set(v.id, {
      productId: v.product_id,
      slug: v.products.slug,
      reviewed: reviewed.has(v.product_id),
      published: reviewed.get(v.product_id) ?? false,
    });
  }
  return out;
}
