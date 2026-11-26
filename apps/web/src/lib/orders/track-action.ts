'use server';

import { headers } from 'next/headers';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRACK_NOT_FOUND, trackSchema, type TrackState } from './track';

/**
 * Guest order lookup. A server action is a public endpoint, so: Zod-validate, rate-limit
 * per IP, require BOTH the order number and the checkout email (compared server-side), and
 * return the same message whether the number or the email was wrong. Uses the service-role
 * client because guests have no session for RLS; it returns progress only — no address,
 * phone or payment reference.
 */
export async function trackOrderAction(_prev: TrackState, form: FormData): Promise<TrackState> {
  const parsed = trackSchema.safeParse({
    orderNumber: form.get('orderNumber'),
    email: form.get('email'),
  });
  if (!parsed.success) {
    return { status: 'error', error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const ip = clientIp(await headers());
  if (!rateLimit(`track:${ip}`, 10, 10 * 60_000)) {
    return { status: 'error', error: 'Too many lookups. Please wait a few minutes and try again.' };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select(
      'order_number, email, status, payment_status, total, created_at, order_items(title, qty)',
    )
    .eq('order_number', parsed.data.orderNumber)
    .limit(1)
    .returns<
      {
        order_number: string;
        email: string;
        status: string;
        payment_status: string;
        total: number;
        created_at: string;
        order_items: { title: string; qty: number }[];
      }[]
    >();
  const row = data?.[0];
  if (!row || row.email.trim().toLowerCase() !== parsed.data.email) {
    return { status: 'error', error: TRACK_NOT_FOUND };
  }

  return {
    status: 'found',
    order: {
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      total: row.total,
      createdAt: row.created_at,
      items: (row.order_items ?? []).map((i) => ({ title: i.title, qty: i.qty })),
    },
  };
}
