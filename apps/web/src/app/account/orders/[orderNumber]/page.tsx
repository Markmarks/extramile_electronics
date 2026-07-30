import { formatGHS, STAFF_FULFILMENT_FLOW, type OrderStatus } from '@extramile/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUserOrder } from '@/lib/orders/queries';

export const metadata: Metadata = { title: 'Order' };
export const dynamic = 'force-dynamic';

function Timeline({ status }: { status: string }) {
  const steps = STAFF_FULFILMENT_FLOW;
  const currentIdx = steps.indexOf(status as OrderStatus);
  const cancelled = status === 'cancelled' || status === 'refunded' || status === 'oversold';
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((step, i) => {
        const done = !cancelled && currentIdx >= i;
        return (
          <li
            key={step}
            className={`rounded-full px-3 py-1 ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {step}
          </li>
        );
      })}
      {cancelled && (
        <li className="rounded-full bg-destructive px-3 py-1 text-destructive-foreground">
          {status}
        </li>
      )}
    </ol>
  );
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getUserOrder(orderNumber);
  if (!order) notFound();

  return (
    <main className="container max-w-2xl space-y-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleString()} · payment {order.paymentStatus}
          </p>
        </div>
        <Link href={`/account/orders/${order.orderNumber}/invoice`} className="text-sm underline">
          Invoice
        </Link>
      </div>

      <Timeline status={order.status} />

      <ul className="divide-y rounded-lg border">
        {order.items.map((item) => (
          <li key={item.sku} className="flex justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium">
                {item.title} × {item.qty}
              </p>
              <p className="text-xs text-muted-foreground">
                SKU {item.sku}
                {item.warrantyMonths > 0 && ` · ${item.warrantyMonths}-mo warranty`}
              </p>
              {item.serials.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  IMEI/Serial: {item.serials.join(', ')}
                </p>
              )}
            </div>
            <span className="text-sm">{formatGHS(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <dl className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatGHS(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd>{order.shippingFee === 0 ? 'Free' : formatGHS(order.shippingFee)}</dd>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-success">
            <dt>Discount</dt>
            <dd>−{formatGHS(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t pt-1 font-semibold">
          <dt>Total</dt>
          <dd>{formatGHS(order.total)}</dd>
        </div>
        {order.payment?.reference && (
          <p className="pt-2 text-xs text-muted-foreground">
            Paystack ref: {order.payment.reference}
          </p>
        )}
      </dl>
    </main>
  );
}
