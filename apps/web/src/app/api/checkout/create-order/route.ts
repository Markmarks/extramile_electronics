import { createOrderSchema, type Tables } from '@extramile/core';
import { NextResponse, type NextRequest } from 'next/server';
import { currentUserId, getCurrentCartId } from '@/lib/cart/cart';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { orderConfirmation } from '@/lib/email/templates';
import { notifyOnce } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const ERROR_MAP: Record<string, { status: number; message: string }> = {
  INSUFFICIENT_STOCK: {
    status: 409,
    message: 'Some items just went out of stock. Please review your cart.',
  },
  EMPTY_CART: { status: 400, message: 'Your cart is empty.' },
  INVALID_COUPON: { status: 400, message: 'That coupon is not valid.' },
  COUPON_LIMIT_REACHED: {
    status: 409,
    message:
      "You've already used this coupon as many times as it allows. Remove it to place your order.",
  },
  INVALID_ZONE: { status: 400, message: 'Choose a valid delivery option.' },
};

export async function POST(req: NextRequest) {
  if (!rateLimit(`checkout:${clientIp(req.headers)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // The client sends variant ids + quantities and contact/address only — never prices.
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your details.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const cartId = await getCurrentCartId();
  if (!cartId) return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });

  const userId = await currentUserId();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('create_order', {
    p_cart_id: cartId,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_ship_to: parsed.data.shipTo,
    p_zone_id: parsed.data.zoneId,
    p_coupon: parsed.data.couponCode ?? undefined,
    p_user_id: userId ?? undefined,
  });

  if (error) {
    const code = Object.keys(ERROR_MAP).find((c) => error.message.includes(c));
    const mapped = code
      ? ERROR_MAP[code]
      : { status: 500, message: 'Could not place your order. Please try again.' };
    return NextResponse.json(
      { error: mapped.message, code: code ?? 'UNKNOWN' },
      { status: mapped.status },
    );
  }

  const order = data as unknown as Tables<'orders'>;

  // Best-effort order-confirmation email (exactly once; never blocks the response).
  try {
    const { data: items } = await admin
      .from('order_items')
      .select('title, qty, line_total')
      .eq('order_id', order.id)
      .returns<{ title: string; qty: number; line_total: number }[]>();
    const tmpl = orderConfirmation({
      orderNumber: order.order_number,
      total: order.total,
      items: (items ?? []).map((i) => ({ title: i.title, qty: i.qty, lineTotal: i.line_total })),
    });
    await notifyOnce({
      orderId: order.id,
      event: 'order_confirmation',
      to: order.email,
      subject: tmpl.subject,
      html: tmpl.html,
    });
  } catch {
    // ignore — order is created; the email can be retried later
  }

  return NextResponse.json({
    orderNumber: order.order_number,
    orderId: order.id,
    total: order.total,
  });
}
