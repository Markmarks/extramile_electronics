import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Poll target for the processing page. Returns only status enums — no PII. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { orderNumber } = await params;
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
