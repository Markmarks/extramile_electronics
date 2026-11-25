import { refreshStorefront } from './storefront';
import { supabase } from './supabase';

/**
 * Customer reviews. Staff can only publish or hide them (column grant on is_published);
 * the wording and stars stay the customer's. A trigger keeps products.rating_avg /
 * rating_count equal to the published reviews (migration 20261125000002).
 */
export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  is_published: boolean;
  created_at: string;
  product: { title: string; slug: string } | null;
  author: string | null;
}

interface ReviewJoin extends Omit<Review, 'product' | 'author'> {
  products: { title: string; slug: string } | null;
  profiles: { full_name: string | null } | null;
}

export async function listReviews(filter: 'pending' | 'published' | 'all'): Promise<Review[]> {
  let q = supabase
    .from('reviews')
    .select(
      'id, rating, title, body, is_verified_purchase, is_published, created_at, products(title, slug), profiles(full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter !== 'all') q = q.eq('is_published', filter === 'published');
  const { data } = await q.returns<ReviewJoin[]>();
  return (data ?? []).map(({ products, profiles, ...r }) => ({
    ...r,
    product: products,
    author: profiles?.full_name ?? null,
  }));
}

export async function setReviewPublished(id: string, published: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('reviews')
    .update({ is_published: published })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Not saved — the review was not found or you lack access.');
  refreshStorefront();
}
