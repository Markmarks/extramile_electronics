import { uuidSchema } from '@extramile/core';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { publicEnv } from '@/lib/env';
import { initialize } from '@/lib/paystack/client';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ orderId: uuidSchema });

function shortRef(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

type OrderRow = {
  id: string;
  order_number: string;
  email: string;
  total: number;
  status: string;
  payment_status: string;
};

export async function POST(req: NextRequest) {
  if (!rateLimit(`pay:${clientIp(req.headers)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select('id, order_number, email, total, status, payment_status')
    .eq('id', parsed.data.orderId)
    .limit(1)
    .returns<OrderRow[]>();
  const order = data?.[0];
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.payment_status === 'paid') return NextResponse.json({ alreadyPaid: true });
  if (order.status === 'cancelled') {
    return NextResponse.json(
      { error: 'This order has expired. Please start again.' },
      { status: 409 },
    );
  }

  // New reference each attempt so a previously failed one can never fulfil (P-13).
  const reference = `${order.order_number}-${shortRef()}`;
  await admin
    .from('payments')
    .insert({ order_id: order.id, reference, amount: order.total, status: 'initialized' });

  try {
    const init = await initialize({
      email: order.email,
      amount: order.total,
      reference,
      callbackUrl: `${publicEnv.siteUrl}/checkout/${order.order_number}/processing`,
      metadata: { order_id: order.id, order_number: order.order_number },
    });
    return NextResponse.json({ authorizationUrl: init.authorization_url, reference });
  } catch {
    await admin.from('payments').update({ status: 'init_failed' }).eq('reference', reference);
    return NextResponse.json(
      { error: 'Could not start payment. Please try again shortly.' },
      { status: 502 },
    );
  }
}
