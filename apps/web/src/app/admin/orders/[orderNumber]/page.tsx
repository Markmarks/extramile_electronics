import { formatGHS, type OrderStatus } from '@extramile/core';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OrderTransition } from '@/components/admin/order-transition';
import { requireStaff } from '@/lib/admin/guard';
import { getUserOrder } from '@/lib/orders/queries';

export const metadata: Metadata = { title: 'Admin · Order' };
export const dynamic = 'force-dynamic';

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  await requireStaff();
  const { orderNumber } = await params;
  // RLS lets staff read any order via the same query.
  const order = await getUserOrder(orderNumber);
  if (!order) notFound();

  const shipTo = order.shipTo as {
    recipient?: string;
    line1?: string;
    city?: string;
    region?: string;
  };

  return (
    <main className="container max-w-2xl space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {order.status} · payment {order.paymentStatus} · {formatGHS(order.total)}
        </p>
      </div>

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Fulfilment</h2>
        <OrderTransition orderId={order.id} status={order.status as OrderStatus} />
      </section>

      <section className="text-sm">
        <h2 className="mb-1 font-semibold">Ship to</h2>
        <p className="text-muted-foreground">
          {shipTo.recipient} · {shipTo.line1}, {shipTo.city}, {shipTo.region} · {order.phone}
        </p>
      </section>

      <ul className="divide-y rounded-lg border">
        {order.items.map((item) => (
          <li key={item.sku} className="flex justify-between p-3 text-sm">
            <span>
              {item.title} × {item.qty}
              {item.serials.length > 0 && (
                <span className="block text-xs text-muted-foreground">
                  {item.serials.join(', ')}
                </span>
              )}
            </span>
            <span>{formatGHS(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {order.payment?.reference && (
        <p className="text-xs text-muted-foreground">Paystack ref: {order.payment.reference}</p>
      )}
    </main>
  );
}
