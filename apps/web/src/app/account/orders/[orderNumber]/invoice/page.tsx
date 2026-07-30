import { formatGHS } from '@extramile/core';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/print-button';
import { getUserOrder } from '@/lib/orders/queries';

export const metadata: Metadata = { title: 'Invoice' };
export const dynamic = 'force-dynamic';

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getUserOrder(orderNumber);
  if (!order) notFound();

  const shipTo = order.shipTo as {
    recipient?: string;
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
  };

  return (
    <main className="container max-w-2xl space-y-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">ExtraMile Electronics</h1>
          <p className="text-sm text-muted-foreground">Accra, Ghana</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">Invoice</p>
          <p className="text-muted-foreground">{order.orderNumber}</p>
          <p className="text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="text-sm">
        <p className="font-medium">Bill to</p>
        <p className="text-muted-foreground">
          {shipTo.recipient ?? order.email}
          {shipTo.line1 ? `, ${shipTo.line1}` : ''}
          {shipTo.city ? `, ${shipTo.city}` : ''}
          {shipTo.region ? `, ${shipTo.region}` : ''}
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Item</th>
            <th className="py-2 text-center">Qty</th>
            <th className="py-2 text-right">Line total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.sku} className="border-b">
              <td className="py-2">{i.title}</td>
              <td className="py-2 text-center">{i.qty}</td>
              <td className="py-2 text-right">{formatGHS(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatGHS(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd>{formatGHS(order.shippingFee)}</dd>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Discount</dt>
            <dd>−{formatGHS(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t pt-1 font-semibold">
          <dt>Total ({order.currency})</dt>
          <dd>{formatGHS(order.total)}</dd>
        </div>
      </dl>

      {order.payment?.reference && (
        <p className="text-xs text-muted-foreground">
          Paystack reference: {order.payment.reference}
        </p>
      )}

      <PrintButton />
    </main>
  );
}
