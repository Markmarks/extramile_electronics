import { cedisToPesewas, type Enums } from '@extramile/core';
import { supabase } from './supabase';

// Catalogue CRUD — the desktop is where full catalogue management lives
// (web admin is read-only, docs/07 §2). All writes go straight to the tables and
// are authorised by RLS `is_staff()`; no Edge Function is needed for these.

export type Condition = Enums<'product_cond'>;
export const CONDITIONS: Condition[] = ['new', 'open_box', 'refurbished'];

export interface Category {
  id: string;
  name: string;
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

export interface ProductRow {
  id: string;
  title: string;
  is_active: boolean;
  category: string | null;
  brand: string | null;
  variants: VariantRow[];
}

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
    .select('id, name')
    .order('name')
    .returns<Category[]>();
  return data ?? [];
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
}

export async function createBrand(name: string): Promise<void> {
  const { error } = await supabase.from('brands').insert({ name, slug: slugify(name) });
  if (error) throw new Error(error.message);
}

interface ProductJoin {
  id: string;
  title: string;
  is_active: boolean;
  categories: { name: string } | null;
  brands: { name: string } | null;
  product_variants: VariantRow[];
}

export async function listProducts(): Promise<ProductRow[]> {
  const { data } = await supabase
    .from('products')
    .select(
      'id, title, is_active, categories(name), brands(name), product_variants(id, sku, price, stock, is_active)',
    )
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<ProductJoin[]>();
  return (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    is_active: p.is_active,
    category: p.categories?.name ?? null,
    brand: p.brands?.name ?? null,
    variants: p.product_variants ?? [],
  }));
}

export interface NewProduct {
  title: string;
  categoryId: string;
  brandId: string;
  description: string;
  condition: Condition;
  warrantyMonths: number;
  isActive: boolean;
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
    })
    .select('id')
    .returns<{ id: string }[]>();
  if (error) throw new Error(error.message);
  const id = data?.[0]?.id;
  if (!id) throw new Error('Product was not created.');
  return id;
}

export async function createVariant(
  productId: string,
  sku: string,
  priceCedis: number,
  stock: number,
): Promise<void> {
  const { error } = await supabase.from('product_variants').insert({
    product_id: productId,
    sku,
    price: cedisToPesewas(priceCedis),
    stock,
  });
  if (error) throw new Error(error.message);
}

export async function updateVariant(
  id: string,
  patch: { priceCedis?: number; stock?: number; is_active?: boolean },
): Promise<void> {
  const row: { price?: number; stock?: number; is_active?: boolean } = {};
  if (patch.priceCedis !== undefined) row.price = cedisToPesewas(patch.priceCedis);
  if (patch.stock !== undefined) row.stock = patch.stock;
  if (patch.is_active !== undefined) row.is_active = patch.is_active;
  const { error } = await supabase.from('product_variants').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setProductActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(error.message);
}
