import {
  cedisToPesewas,
  PRODUCT_CONDITIONS,
  type Database,
  type Json,
  type ProductCondition,
  type SpecValue,
} from '@extramile/core';
import { invokeAdminAction } from './adminActions';
import { refreshStorefront } from './storefront';
import { supabase } from './supabase';

// Catalogue CRUD — the desktop is where full catalogue management lives
// (web admin is read-only, docs/07 §2). All writes go straight to the tables and
// are authorised by RLS `is_staff()`; no Edge Function is needed for these.
// Every successful write calls refreshStorefront() so the shop's cached pages update
// straight away instead of up to 5 minutes later.

export type Condition = ProductCondition;
export const CONDITIONS: Condition[] = PRODUCT_CONDITIONS;

export type Specs = Record<string, SpecValue>;

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  /** Expected spec keys + types for products in this category. */
  spec_schema: Record<string, unknown>;
}
export interface Brand {
  id: string;
  name: string;
}

export interface VariantRow {
  id: string;
  sku: string;
  price: number;
  /** "Was" price shown struck through on the shop; must be above `price`. null = no sale. */
  compare_at_price: number | null;
  stock: number;
  is_active: boolean;
  /** Options shown on the shop's variant picker, e.g. { color: "Blue", storage: "128GB" }. */
  attrs: Record<string, string>;
  weight_grams: number;
}

export interface ProductImage {
  id: string;
  storage_path: string;
  sort_order: number;
  alt: string | null;
}

export interface ProductRow {
  id: string;
  title: string;
  slug: string;
  model: string | null;
  description: string | null;
  warranty_months: number;
  warranty_provider: string | null;
  is_active: boolean;
  condition: Condition;
  category_id: string | null;
  category: string | null;
  specs: Specs;
  brand_id: string | null;
  brand: string | null;
  variants: VariantRow[];
  images: ProductImage[];
}

const IMAGE_BUCKET = 'product-images';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // matches the bucket's 2MiB limit

/** URL-safe slug with a short suffix so the unique constraint rarely collides. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'item'}-${suffix}`;
}

export async function listCategories(): Promise<Category[]> {
  const { data } = await supabase
    .from('categories')
    .select('id, name, parent_id, sort_order, is_active, spec_schema')
    .order('sort_order')
    .order('name')
    .returns<Category[]>();
  return (data ?? []).map((c) => ({ ...c, spec_schema: c.spec_schema ?? {} }));
}

export async function listBrands(): Promise<Brand[]> {
  const { data } = await supabase
    .from('brands')
    .select('id, name')
    .order('name')
    .returns<Brand[]>();
  return data ?? [];
}

export async function createCategory(name: string): Promise<void> {
  const { error } = await supabase.from('categories').insert({ name, slug: slugify(name) });
  if (error) throw new Error(error.message);
  refreshStorefront();
}

export async function createBrand(name: string): Promise<void> {
  const { error } = await supabase.from('brands').insert({ name, slug: slugify(name) });
  if (error) throw new Error(error.message);
  refreshStorefront();
}

interface ProductJoin {
  id: string;
  title: string;
  slug: string;
  model: string | null;
  description: string | null;
  warranty_months: number;
  warranty_provider: string | null;
  is_active: boolean;
  condition: Condition;
  category_id: string | null;
  brand_id: string | null;
  specs: Specs | null;
  categories: { name: string } | null;
  brands: { name: string } | null;
  product_variants: (Omit<VariantRow, 'attrs'> & { attrs: unknown })[];
  product_images: ProductImage[];
}

/** jsonb attrs → string map (non-string values are stringified). */
function asAttrs(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, String(x)]),
  );
}

export async function listProducts(): Promise<ProductRow[]> {
  const { data } = await supabase
    .from('products')
    .select(
      'id, title, slug, model, description, warranty_months, warranty_provider, is_active, condition, category_id, brand_id, specs, categories(name), brands(name), product_variants(id, sku, price, compare_at_price, stock, is_active, attrs, weight_grams), product_images(id, storage_path, sort_order, alt)',
    )
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<ProductJoin[]>();
  return (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    model: p.model,
    description: p.description,
    warranty_months: p.warranty_months,
    warranty_provider: p.warranty_provider,
    is_active: p.is_active,
    condition: p.condition,
    category_id: p.category_id,
    brand_id: p.brand_id,
    specs: p.specs ?? {},
    category: p.categories?.name ?? null,
    brand: p.brands?.name ?? null,
    variants: (p.product_variants ?? [])
      .map((v) => ({ ...v, attrs: asAttrs(v.attrs) }))
      .sort((a, b) => a.price - b.price || a.sku.localeCompare(b.sku)),
    images: (p.product_images ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

/** Public URL for a stored image path (the bucket is public). */
export function imageUrl(storagePath: string): string {
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** Upload an image to the product-images bucket and link it to the product. */
export async function uploadProductImage(productId: string, file: File): Promise<void> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 2 MB limit.');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `products/${productId}/${globalThis.crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { error } = await supabase
    .from('product_images')
    .insert({ product_id: productId, storage_path: path });
  if (error) {
    // Roll the orphaned object back so storage and the table stay in sync.
    await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  refreshStorefront();
}

export async function deleteProductImage(id: string, storagePath: string): Promise<void> {
  const { data, error } = await supabase.from('product_images').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(NOT_SAVED);
  await supabase.storage.from(IMAGE_BUCKET).remove([storagePath]);
  refreshStorefront();
}

/**
 * RLS turns a forbidden or missing-row UPDATE/DELETE into "0 rows, no error". Without
 * this check the screen would say "saved" while nothing changed in the database.
 */
const NOT_SAVED = 'Not saved — the item was not found or your account cannot change it.';

type ProductPatch = Database['public']['Tables']['products']['Update'];
type VariantPatch = Database['public']['Tables']['product_variants']['Update'];

async function updateProduct(id: string, row: ProductPatch): Promise<void> {
  saved(await supabase.from('products').update(row).eq('id', id).select('id'));
}

async function updateVariantRow(id: string, row: VariantPatch): Promise<void> {
  saved(await supabase.from('product_variants').update(row).eq('id', id).select('id'));
}

function saved(res: { data: unknown[] | null; error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error(NOT_SAVED);
  refreshStorefront();
}

export interface NewProduct {
  title: string;
  categoryId: string;
  brandId: string;
  description: string;
  condition: Condition;
  warrantyMonths: number;
  isActive: boolean;
  specs: Specs;
}

/** Create a product; returns the new id so a first variant can be attached. */
export async function createProduct(p: NewProduct): Promise<string> {
  const { data, error } = await supabase
    .from('products')
    .insert({
      title: p.title,
      slug: slugify(p.title),
      category_id: p.categoryId,
      brand_id: p.brandId,
      description: p.description || null,
      condition: p.condition,
      warranty_months: p.warrantyMonths,
      is_active: p.isActive,
      specs: p.specs as Json,
    })
    .select('id')
    .returns<{ id: string }[]>();
  if (error) throw new Error(error.message);
  const id = data?.[0]?.id;
  if (!id) throw new Error('Product was not created.');
  refreshStorefront();
  return id;
}

/**
 * Stock never changes by writing `product_variants.stock` (signed-in users have no
 * UPDATE on it — migration 20261125000001). It goes through admin-actions →
 * adjust_stock(): one atomic `stock = stock + delta` that refuses to drop below the
 * units reserved for unpaid orders and writes the inventory_movements log. A sale
 * committed while this screen was open is therefore kept, not overwritten.
 */
async function moveStock(variantId: string, delta: number, reason: string): Promise<void> {
  if (delta === 0) return;
  await invokeAdminAction('stock_adjust_large', { variant_id: variantId, delta, reason });
}

export async function createVariant(
  productId: string,
  sku: string,
  priceCedis: number,
  stock: number,
): Promise<void> {
  const { data, error } = await supabase
    .from('product_variants')
    .insert({ product_id: productId, sku, price: cedisToPesewas(priceCedis) })
    .select('id')
    .returns<{ id: string }[]>();
  if (error) throw new Error(error.message);
  const id = data?.[0]?.id;
  if (!id) throw new Error(NOT_SAVED);
  refreshStorefront();
  // Opening stock is logged as received goods.
  await moveStock(id, stock, 'purchase');
}

export async function updateVariant(
  id: string,
  patch: {
    priceCedis?: number;
    is_active?: boolean;
    /** New on-hand count, applied as (stock − previousStock) so concurrent sales survive. */
    stock?: { previous: number; next: number };
  },
): Promise<void> {
  const row: VariantPatch = {};
  if (patch.priceCedis !== undefined) row.price = cedisToPesewas(patch.priceCedis);
  if (patch.is_active !== undefined) row.is_active = patch.is_active;
  if (Object.keys(row).length) {
    try {
      await updateVariantRow(id, row);
    } catch (err) {
      throw new Error(variantMessage(err));
    }
  }
  if (patch.stock) await moveStock(id, patch.stock.next - patch.stock.previous, 'adjust');
}

export async function setProductActive(id: string, isActive: boolean): Promise<void> {
  await updateProduct(id, { is_active: isActive });
}

export async function setProductCondition(id: string, condition: Condition): Promise<void> {
  await updateProduct(id, { condition });
}

/** Replace a product's tech specs (empty values are dropped by the caller). */
export async function updateProductSpecs(id: string, specs: Specs): Promise<void> {
  await updateProduct(id, { specs: specs as Json });
}

// ── Editing after creation ────────────────────────────────────────────────────────
// The slug is never changed: shared links and search results keep working when a
// product is renamed.

export interface ProductDetails {
  title: string;
  description: string | null;
  model: string | null;
  category_id: string;
  brand_id: string;
  warranty_months: number;
  warranty_provider: string | null;
}

export async function updateProductDetails(id: string, d: ProductDetails): Promise<void> {
  if (!d.title.trim()) throw new Error('The product needs a title.');
  if (!Number.isInteger(d.warranty_months) || d.warranty_months < 0)
    throw new Error('Warranty must be 0 or more whole months.');
  await updateProduct(id, {
    ...d,
    title: d.title.trim(),
    description: d.description?.trim() || null,
    model: d.model?.trim() || null,
    warranty_provider: d.warranty_provider?.trim() || null,
  });
}

export interface VariantDetails {
  sku: string;
  attrs: Record<string, string>;
  weight_grams: number;
  /** pesewas; null clears the sale */
  compare_at_price: number | null;
}

export async function updateVariantDetails(id: string, d: VariantDetails): Promise<void> {
  if (!d.sku.trim()) throw new Error('The variant needs a SKU.');
  if (!Number.isInteger(d.weight_grams) || d.weight_grams <= 0)
    throw new Error('Weight must be a whole number of grams above 0.');
  const attrs = Object.fromEntries(
    Object.entries(d.attrs)
      .map(([k, v]) => [k.trim(), v.trim()] as const)
      .filter(([k, v]) => k && v),
  );
  try {
    await updateVariantRow(id, {
      sku: d.sku.trim(),
      attrs: attrs as Json,
      weight_grams: d.weight_grams,
      compare_at_price: d.compare_at_price,
    });
  } catch (err) {
    throw new Error(variantMessage(err));
  }
}

/** Translate variant constraint errors into something staff can act on. */
export function variantMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/compare_at_price/.test(m))
    return 'The “was” price must be higher than the selling price (or leave it blank).';
  if (/product_variants_sku_key|duplicate key/.test(m))
    return 'Another variant already uses that SKU.';
  return m;
}

/** Move an image one place left/right; the first image is the main photo on the shop. */
export async function moveImage(images: ProductImage[], id: string, dir: -1 | 1): Promise<void> {
  const i = images.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= images.length) return;
  const order = [...images];
  [order[i], order[j]] = [order[j]!, order[i]!];
  // Renumber 0..n so duplicates from older uploads (all sort_order 0) sort predictably.
  for (const [n, img] of order.entries()) {
    if (img.sort_order === n) continue;
    const { error } = await supabase
      .from('product_images')
      .update({ sort_order: n })
      .eq('id', img.id);
    if (error) throw new Error(error.message);
  }
  refreshStorefront();
}

export async function setImageAlt(id: string, alt: string): Promise<void> {
  const { data, error } = await supabase
    .from('product_images')
    .update({ alt: alt.trim() || null })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(NOT_SAVED);
  refreshStorefront();
}

// ── Categories & brands ──────────────────────────────────────────────────────────

export interface CategoryPatch {
  name?: string;
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
  spec_schema?: Record<string, unknown>;
}

export async function updateCategory(id: string, patch: CategoryPatch): Promise<void> {
  if (patch.parent_id === id) throw new Error('A category can’t be inside itself.');
  const { spec_schema, ...rest } = patch;
  const row: Database['public']['Tables']['categories']['Update'] = {
    ...rest,
    ...(spec_schema ? { spec_schema: spec_schema as Json } : {}),
  };
  const { data, error } = await supabase.from('categories').update(row).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(NOT_SAVED);
  refreshStorefront();
}

/** Delete only works for a category no product uses (the database refuses otherwise). */
export async function deleteCategory(id: string): Promise<void> {
  const { data, error } = await supabase.from('categories').delete().eq('id', id).select('id');
  if (error) {
    if (/foreign key/.test(error.message))
      throw new Error('Products still use this category — move them or hide the category instead.');
    throw new Error(error.message);
  }
  if (!data?.length) throw new Error(NOT_SAVED);
  refreshStorefront();
}

export async function renameBrand(id: string, name: string): Promise<void> {
  if (!name.trim()) throw new Error('The brand needs a name.');
  const { data, error } = await supabase
    .from('brands')
    .update({ name: name.trim() })
    .eq('id', id)
    .select('id');
  if (error) {
    if (/duplicate key/.test(error.message))
      throw new Error('Another brand already has that name.');
    throw new Error(error.message);
  }
  if (!data?.length) throw new Error(NOT_SAVED);
  refreshStorefront();
}

export async function deleteBrand(id: string): Promise<void> {
  const { data, error } = await supabase.from('brands').delete().eq('id', id).select('id');
  if (error) {
    if (/foreign key/.test(error.message))
      throw new Error('Products still use this brand — change their brand first.');
    throw new Error(error.message);
  }
  if (!data?.length) throw new Error(NOT_SAVED);
  refreshStorefront();
}
