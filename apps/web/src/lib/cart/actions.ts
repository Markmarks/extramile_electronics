'use server';

import { uuidSchema } from '@extramile/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import * as cart from './cart';
import type { CartActionResult } from './cart';

const qtySchema = z.coerce.number().int().min(1).max(99);

export async function addToCartAction(variantId: string, qty = 1): Promise<CartActionResult> {
  const id = uuidSchema.safeParse(variantId);
  const q = qtySchema.safeParse(qty);
  if (!id.success || !q.success) return { ok: false, error: 'Invalid request.' };
  const res = await cart.addItem(id.data, q.data);
  revalidatePath('/cart');
  return res;
}

export async function setQtyAction(variantId: string, qty: number): Promise<CartActionResult> {
  const id = uuidSchema.safeParse(variantId);
  const q = z.coerce.number().int().min(0).max(99).safeParse(qty);
  if (!id.success || !q.success) return { ok: false, error: 'Invalid request.' };
  const res = await cart.setQty(id.data, q.data);
  revalidatePath('/cart');
  return res;
}

export async function removeItemAction(variantId: string): Promise<void> {
  const id = uuidSchema.safeParse(variantId);
  if (!id.success) return;
  await cart.removeItem(id.data);
  revalidatePath('/cart');
}

export async function clearCartAction(): Promise<void> {
  await cart.clearCart();
  revalidatePath('/cart');
}
