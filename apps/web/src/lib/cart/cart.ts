import 'server-only';

import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { productImageUrl } from '@/lib/catalog/queries';
import { clampQty } from './qty';

const CART_COOKIE = 'cart_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

type Admin = ReturnType<typeof createAdminClient>;

export interface CartLine {
  variantId: string;
  sku: string;
  title: string;
  slug: string;
  attrs: Record<string, unknown>;
  qty: number;
  unitPrice: number;
  addedPrice: number;
  compareAtPrice: number | null;
  lineTotal: number;
  available: number;
  imageUrl: string | null;
  stale: boolean;
  isActive: boolean;
}

export interface CartView {
  lines: CartLine[];
  subtotal: number;
  savings: number;
  count: number;
}

export type CartActionResult =
  { ok: true; qty: number; clamped: boolean } | { ok: false; error: string };

function newCartToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function currentUserId(): Promise<string | null> {
  const supabase = await createServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function resolveCartId(admin: Admin, create: boolean): Promise<string | null> {
  const store = await cookies();
  const userId = await currentUserId();

  if (userId) {
    const { data } = await admin
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .returns<{ id: string }[]>();
    if (data?.[0]) return data[0].id;
    if (!create) return null;
    const { data: created } = await admin
      .from('carts')
      .insert({ user_id: userId })
      .select('id')
      .returns<{ id: string }[]>();
    return created?.[0]?.id ?? null;
  }

  const token = store.get(CART_COOKIE)?.value;
  if (token) {
    const { data } = await admin
      .from('carts')
      .select('id')
      .eq('token', token)
      .limit(1)
      .returns<{ id: string }[]>();
    if (data?.[0]) return data[0].id;
  }
  if (!create) return null;

  const freshToken = newCartToken();
  const { data: created } = await admin
    .from('carts')
    .insert({ token: freshToken })
    .select('id')
    .returns<{ id: string }[]>();
  if (!created?.[0]) return null;
  store.set(CART_COOKIE, freshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return created[0].id;
}

type VariantRow = {
  id: string;
  product_id: string;
  price: number;
  stock: number;
  reserved: number;
  is_active: boolean;
};

async function loadVariant(admin: Admin, variantId: string): Promise<VariantRow | null> {
  const { data } = await admin
    .from('product_variants')
    .select('id, product_id, price, stock, reserved, is_active')
    .eq('id', variantId)
    .limit(1)
    .returns<VariantRow[]>();
  return data?.[0] ?? null;
}

export async function addItem(variantId: string, qty: number): Promise<CartActionResult> {
  const admin = createAdminClient();
  const variant = await loadVariant(admin, variantId);
  if (!variant || !variant.is_active) return { ok: false, error: 'This item is unavailable.' };

  const { data: product } = await admin
    .from('products')
    .select('is_active')
    .eq('id', variant.product_id)
    .limit(1)
    .returns<{ is_active: boolean }[]>();
  if (!product?.[0]?.is_active) return { ok: false, error: 'This item is unavailable.' };

  const available = variant.stock - variant.reserved;
  const cartId = await resolveCartId(admin, true);
  if (!cartId) return { ok: false, error: 'Could not open a cart.' };

  const { data: existing } = await admin
    .from('cart_items')
    .select('id, qty')
    .eq('cart_id', cartId)
    .eq('variant_id', variantId)
    .limit(1)
    .returns<{ id: string; qty: number }[]>();

  const desired = (existing?.[0]?.qty ?? 0) + qty;
  const finalQty = clampQty(desired, available);
  if (finalQty <= 0) return { ok: false, error: 'Out of stock.' };

  if (existing?.[0]) {
    await admin
      .from('cart_items')
      .update({ qty: finalQty, added_price: variant.price })
      .eq('id', existing[0].id);
  } else {
    await admin.from('cart_items').insert({
      cart_id: cartId,
      variant_id: variantId,
      qty: finalQty,
      added_price: variant.price,
    });
  }
  return { ok: true, qty: finalQty, clamped: finalQty < desired };
}

export async function setQty(variantId: string, qty: number): Promise<CartActionResult> {
  const admin = createAdminClient();
  const cartId = await resolveCartId(admin, false);
  if (!cartId) return { ok: false, error: 'No cart.' };

  if (qty <= 0) {
    await admin.from('cart_items').delete().eq('cart_id', cartId).eq('variant_id', variantId);
    return { ok: true, qty: 0, clamped: false };
  }

  const variant = await loadVariant(admin, variantId);
  if (!variant || !variant.is_active) return { ok: false, error: 'This item is unavailable.' };
  const finalQty = clampQty(qty, variant.stock - variant.reserved);
  if (finalQty <= 0) return { ok: false, error: 'Out of stock.' };

  await admin
    .from('cart_items')
    .update({ qty: finalQty, added_price: variant.price })
    .eq('cart_id', cartId)
    .eq('variant_id', variantId);
  return { ok: true, qty: finalQty, clamped: finalQty < qty };
}

export async function removeItem(variantId: string): Promise<void> {
  const admin = createAdminClient();
  const cartId = await resolveCartId(admin, false);
  if (!cartId) return;
  await admin.from('cart_items').delete().eq('cart_id', cartId).eq('variant_id', variantId);
}

export async function clearCart(): Promise<void> {
  const admin = createAdminClient();
  const cartId = await resolveCartId(admin, false);
  if (!cartId) return;
  await admin.from('cart_items').delete().eq('cart_id', cartId);
}

/** Current cart id without creating one — used by checkout/quote (read-only). */
export async function getCurrentCartId(): Promise<string | null> {
  const admin = createAdminClient();
  return resolveCartId(admin, false);
}

export async function getCartCount(): Promise<number> {
  const admin = createAdminClient();
  const cartId = await resolveCartId(admin, false);
  if (!cartId) return 0;
  const { data } = await admin
    .from('cart_items')
    .select('qty')
    .eq('cart_id', cartId)
    .returns<{ qty: number }[]>();
  return (data ?? []).reduce((sum, r) => sum + r.qty, 0);
}

export async function getCart(): Promise<CartView> {
  const empty: CartView = { lines: [], subtotal: 0, savings: 0, count: 0 };
  const admin = createAdminClient();
  const cartId = await resolveCartId(admin, false);
  if (!cartId) return empty;

  const { data: items } = await admin
    .from('cart_items')
    .select('variant_id, qty, added_price')
    .eq('cart_id', cartId)
    .returns<{ variant_id: string; qty: number; added_price: number }[]>();
  if (!items || items.length === 0) return empty;

  const variantIds = items.map((i) => i.variant_id);
  const { data: variants } = await admin
    .from('product_variants')
    .select('id, product_id, sku, attrs, price, compare_at_price, stock, reserved, is_active')
    .in('id', variantIds)
    .returns<
      {
        id: string;
        product_id: string;
        sku: string;
        attrs: unknown;
        price: number;
        compare_at_price: number | null;
        stock: number;
        reserved: number;
        is_active: boolean;
      }[]
    >();
  const variantMap = new Map((variants ?? []).map((v) => [v.id, v]));

  const productIds = [...new Set((variants ?? []).map((v) => v.product_id))];
  const { data: products } = await admin
    .from('products')
    .select('id, title, slug')
    .in('id', productIds)
    .returns<{ id: string; title: string; slug: string }[]>();
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  const { data: images } = await admin
    .from('product_images')
    .select('product_id, storage_path, sort_order')
    .in('product_id', productIds)
    .order('sort_order', { ascending: true })
    .returns<{ product_id: string; storage_path: string }[]>();
  const imageMap = new Map<string, string>();
  for (const img of images ?? []) {
    if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.storage_path);
  }

  const lines: CartLine[] = [];
  let subtotal = 0;
  let savings = 0;
  for (const item of items) {
    const v = variantMap.get(item.variant_id);
    if (!v) continue;
    const p = productMap.get(v.product_id);
    const lineTotal = v.price * item.qty;
    subtotal += lineTotal;
    if (v.compare_at_price && v.compare_at_price > v.price) {
      savings += (v.compare_at_price - v.price) * item.qty;
    }
    lines.push({
      variantId: v.id,
      sku: v.sku,
      title: p?.title ?? 'Item',
      slug: p?.slug ?? '',
      attrs:
        v.attrs !== null && typeof v.attrs === 'object' && !Array.isArray(v.attrs)
          ? (v.attrs as Record<string, unknown>)
          : {},
      qty: item.qty,
      unitPrice: v.price,
      addedPrice: item.added_price,
      compareAtPrice: v.compare_at_price,
      lineTotal,
      available: Math.max(v.stock - v.reserved, 0),
      imageUrl: productImageUrl(imageMap.get(v.product_id)),
      stale: item.added_price !== v.price,
      isActive: v.is_active,
    });
  }

  const count = lines.reduce((sum, l) => sum + l.qty, 0);
  return { lines, subtotal, savings, count };
}
