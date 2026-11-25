import { ORDER_NUMBER_RE } from '@extramile/core';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ orderNumber: z.string().regex(ORDER_NUMBER_RE) });

/** Poll target for the processing page. Returns only status enums — no PII. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { orderNumber } = parsed.data;
  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select('status, payment_status')
    .eq('order_number', orderNumber)
    .limit(1)
    .returns<{ status: string; payment_status: string }[]>();
  const order = data?.[0];
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ status: order.status, paymentStatus: order.payment_status });
}
