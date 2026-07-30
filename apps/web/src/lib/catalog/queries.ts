import 'server-only';

import type { Tables } from '@extramile/core';
import { createPublicClient } from '@/lib/supabase/public';

export type Condition = Tables<'products'>['condition'];
export type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating';

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: CategoryNode[];
}

export interface ProductListItem {
  id: string;
  title: string;
  slug: string;
  condition: Condition;
  ratingAvg: number;
  ratingCount: number;
  brand: Brand | null;
  minPrice: number | null;
  compareAtPrice: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  inStock: boolean;
}

export interface VariantDetail {
  id: string;
  sku: string;
  attrs: Record<string, unknown>;
  price: number;
  compareAtPrice: number | null;
  available: number;
}

export interface ProductImageView {
  url: string | null;
  alt: string | null;
  variantId: string | null;
}

export interface ProductDetail {
  id: string;
  title: string;
  slug: string;
  model: string | null;
  description: string | null;
  specs: Record<string, unknown>;
  condition: Condition;
  warrantyMonths: number;
  warrantyProvider: string | null;
  ratingAvg: number;
  ratingCount: number;
  category: { id: string; name: string; slug: string; specSchema: Record<string, unknown> } | null;
  brand: Brand | null;
  variants: VariantDetail[];
  images: ProductImageView[];
}

export interface ListParams {
  q?: string;
  categoryId?: string;
  brandId?: string;
  condition?: Condition;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface ListResult {
  items: ProductListItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function productImageUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/product-images/${storagePath}`;
}

type VariantAggRow = {
  product_id: string;
  price: number;
  compare_at_price: number | null;
  stock: number;
  reserved: number;
};
type ImageRow = {
  product_id: string;
  storage_path: string;
  alt: string | null;
  sort_order: number;
};

type Supa = ReturnType<typeof createPublicClient>;

async function hydrateListItems(
  supabase: Supa,
  rows: Tables<'products'>[],
): Promise<ProductListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const brandIds = [...new Set(rows.map((r) => r.brand_id))];

  const [variantsRes, imagesRes, brandsRes] = await Promise.all([
    supabase
      .from('product_variants')
      .select('product_id, price, compare_at_price, stock, reserved')
      .in('product_id', ids)
      .eq('is_active', true)
      .returns<VariantAggRow[]>(),
    supabase
      .from('product_images')
      .select('product_id, storage_path, alt, sort_order')
      .in('product_id', ids)
      .order('sort_order', { ascending: true })
      .returns<ImageRow[]>(),
    supabase.from('brands').select('id, name, slug').in('id', brandIds).returns<Brand[]>(),
  ]);

  const variants = variantsRes.data ?? [];
  const images = imagesRes.data ?? [];
  const brands = new Map((brandsRes.data ?? []).map((b) => [b.id, b]));

  const minPrice = new Map<string, number>();
  const compareAt = new Map<string, number | null>();
  const inStock = new Map<string, boolean>();
  for (const v of variants) {
    const cur = minPrice.get(v.product_id);
    if (cur === undefined || v.price < cur) {
      minPrice.set(v.product_id, v.price);
      compareAt.set(v.product_id, v.compare_at_price);
    }
    if (v.stock - v.reserved > 0) inStock.set(v.product_id, true);
  }

  const primaryImage = new Map<string, ImageRow>();
  for (const img of images) {
    if (!primaryImage.has(img.product_id)) primaryImage.set(img.product_id, img);
  }

  return rows.map((r) => {
    const img = primaryImage.get(r.id);
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      condition: r.condition,
      ratingAvg: r.rating_avg,
      ratingCount: r.rating_count,
      brand: brands.get(r.brand_id) ?? null,
      minPrice: minPrice.get(r.id) ?? null,
      compareAtPrice: compareAt.get(r.id) ?? null,
      imageUrl: productImageUrl(img?.storage_path),
      imageAlt: img?.alt ?? r.title,
      inStock: inStock.get(r.id) ?? false,
    };
  });
}

// ── public queries ────────────────────────────────────────────────────────────

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .returns<{ id: string; name: string; slug: string; parent_id: string | null }[]>();

  const rows = data ?? [];
  const byId = new Map<string, CategoryNode>(
    rows.map((r) => [
      r.id,
      { id: r.id, name: r.name, slug: r.slug, parentId: r.parent_id, children: [] },
    ]),
  );
  const roots: CategoryNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id);
    if (!node) continue;
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function getCategoryBySlug(
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .limit(1)
    .returns<{ id: string; name: string; slug: string }[]>();
  return data?.[0] ?? null;
}

export async function getActiveBrands(): Promise<Brand[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('brands')
    .select('id, name, slug')
    .order('name', { ascending: true })
    .returns<Brand[]>();
  return data ?? [];
}

export async function listProducts(params: ListParams): Promise<ListResult> {
  const supabase = createPublicClient();
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 24, 1), 48);

  const { data } = await supabase.rpc('search_products', {
    q: params.q ?? '',
    p_category: params.categoryId,
    p_brand: params.brandId,
    p_condition: params.condition,
    p_in_stock: params.inStock ?? false,
    p_min_price: params.minPrice,
    p_max_price: params.maxPrice,
    p_sort: params.sort ?? 'relevance',
    p_limit: pageSize + 1, // +1 to detect another page
    p_offset: (page - 1) * pageSize,
  });

  const rows = (data ?? []) as Tables<'products'>[];
  const hasMore = rows.length > pageSize;
  const items = await hydrateListItems(supabase, rows.slice(0, pageSize));
  return { items, page, pageSize, hasMore };
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const supabase = createPublicClient();
  const { data: prodRows } = await supabase
    .from('products')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .limit(1)
    .returns<Tables<'products'>[]>();
  const product = prodRows?.[0];
  if (!product) return null;

  const [catRes, brandRes, variantsRes, imagesRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, slug, spec_schema')
      .eq('id', product.category_id)
      .limit(1)
      .returns<{ id: string; name: string; slug: string; spec_schema: unknown }[]>(),
    supabase
      .from('brands')
      .select('id, name, slug')
      .eq('id', product.brand_id)
      .limit(1)
      .returns<Brand[]>(),
    supabase
      .from('product_variants')
      .select('id, sku, attrs, price, compare_at_price, stock, reserved')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .order('price', { ascending: true })
      .returns<
        {
          id: string;
          sku: string;
          attrs: unknown;
          price: number;
          compare_at_price: number | null;
          stock: number;
          reserved: number;
        }[]
      >(),
    supabase
      .from('product_images')
      .select('storage_path, alt, variant_id, sort_order')
      .eq('product_id', product.id)
      .order('sort_order', { ascending: true })
      .returns<{ storage_path: string; alt: string | null; variant_id: string | null }[]>(),
  ]);

  const cat = catRes.data?.[0];
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    model: product.model,
    description: product.description,
    specs: asRecord(product.specs),
    condition: product.condition,
    warrantyMonths: product.warranty_months,
    warrantyProvider: product.warranty_provider,
    ratingAvg: product.rating_avg,
    ratingCount: product.rating_count,
    category: cat
      ? { id: cat.id, name: cat.name, slug: cat.slug, specSchema: asRecord(cat.spec_schema) }
      : null,
    brand: brandRes.data?.[0] ?? null,
    variants: (variantsRes.data ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      attrs: asRecord(v.attrs),
      price: v.price,
      compareAtPrice: v.compare_at_price,
      available: Math.max(v.stock - v.reserved, 0),
    })),
    images: (imagesRes.data ?? []).map((img) => ({
      url: productImageUrl(img.storage_path),
      alt: img.alt ?? product.title,
      variantId: img.variant_id,
    })),
  };
}

export async function getRelatedProducts(
  categoryId: string,
  excludeProductId: string,
  limit = 4,
): Promise<ProductListItem[]> {
  const result = await listProducts({ categoryId, pageSize: limit + 1, sort: 'rating' });
  return result.items.filter((p) => p.id !== excludeProductId).slice(0, limit);
}
