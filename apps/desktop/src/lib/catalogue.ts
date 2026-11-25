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
  stock: number;
  is_active: boolean;
}

export interface ProductImage {
  id: string;
  storage_path: string;
  sort_order: number;
}

export interface ProductRow {
  id: string;
  title: string;
  is_active: boolean;
  condition: Condition;
  category_id: string | null;
  category: string | null;
  specs: Specs;
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
    .select('id, name, spec_schema')
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
  is_active: boolean;
  condition: Condition;
  category_id: string | null;
  specs: Specs | null;
  categories: { name: string } | null;
  brands: { name: string } | null;
  product_variants: VariantRow[];
  product_images: ProductImage[];
}

export async function listProducts(): Promise<ProductRow[]> {
  const { data } = await supabase
    .from('products')
    .select(
      'id, title, is_active, condition, category_id, specs, categories(name), brands(name), product_variants(id, sku, price, stock, is_active), product_images(id, storage_path, sort_order)',
    )
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<ProductJoin[]>();
  return (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    is_active: p.is_active,
    condition: p.condition,
    category_id: p.category_id,
    specs: p.specs ?? {},
    category: p.categories?.name ?? null,
    brand: p.brands?.name ?? null,
    variants: p.product_variants ?? [],
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
  if (Object.keys(row).length) await updateVariantRow(id, row);
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
