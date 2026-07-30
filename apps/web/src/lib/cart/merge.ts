import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Merge a guest cart (keyed by cookie token) into the signed-in user's cart:
 * sum quantities, cap at min(20, available stock), then delete the guest cart.
 * Runs with the service-role client because guest carts are not reachable by RLS
 * (docs/02-DATA-MODEL.md §006). Covers I-10 / O-07.
 */
export async function mergeGuestCart(token: string, userId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: guest } = await admin.from('carts').select('id').eq('token', token).maybeSingle();
  if (!guest) return;

  // Find or create the user's cart.
  let userCartId: string;
  const { data: existingCart } = await admin
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existingCart) {
    userCartId = existingCart.id;
  } else {
    const { data: created, error } = await admin
      .from('carts')
      .insert({ user_id: userId })
      .select('id')
      .single();
    if (error || !created)
      throw new Error(`cart merge: could not create user cart: ${error?.message}`);
    userCartId = created.id;
  }

  const { data: guestItems } = await admin
    .from('cart_items')
    .select('variant_id, qty, added_price')
    .eq('cart_id', guest.id);

  for (const item of guestItems ?? []) {
    const { data: variant } = await admin
      .from('product_variants')
      .select('stock, reserved, price')
      .eq('id', item.variant_id)
      .maybeSingle();
    const available = variant ? variant.stock - variant.reserved : 0;

    const { data: existing } = await admin
      .from('cart_items')
      .select('id, qty')
      .eq('cart_id', userCartId)
      .eq('variant_id', item.variant_id)
      .maybeSingle();

    const desired = (existing?.qty ?? 0) + item.qty;
    const capped = Math.min(desired, 20, Math.max(available, 0));
    if (capped <= 0) continue;

    if (existing) {
      await admin.from('cart_items').update({ qty: capped }).eq('id', existing.id);
    } else {
      await admin.from('cart_items').insert({
        cart_id: userCartId,
        variant_id: item.variant_id,
        qty: capped,
        added_price: variant?.price ?? item.added_price,
      });
    }
  }

  // Cascade deletes the guest cart's items.
  await admin.from('carts').delete().eq('id', guest.id);
}
