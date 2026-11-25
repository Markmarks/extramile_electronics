import { formatGHS } from '@extramile/core';
import { Logo } from '@extramile/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/print-button';
import { getUserOrder } from '@/lib/orders/queries';

export const metadata: Metadata = { title: 'Invoice' };
export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Accra',
});

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
    <main className="container max-w-2xl space-y-8 py-10 print:max-w-none print:py-0">
      <header className="flex items-start justify-between gap-6 border-b pb-6">
        <div className="space-y-1">
          <Logo descriptor="Electronics" markClassName="h-9" className="text-[22px]" />
          <p className="pt-1 text-[13px] text-muted-foreground">
            ExtraMile Electronics · Accra, Ghana
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold tracking-tight">Invoice</p>
          <p className="font-mono text-[13px]">{order.orderNumber}</p>
          <p className="text-[13px] text-muted-foreground">
            {dateFmt.format(new Date(order.createdAt))}
          </p>
        </div>
      </header>

      <div className="text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Bill to
        </p>
        <p className="mt-1">
          {shipTo.recipient ?? order.email}
          {shipTo.line1 ? `, ${shipTo.line1}` : ''}
          {shipTo.city ? `, ${shipTo.city}` : ''}
          {shipTo.region ? `, ${shipTo.region}` : ''}
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 font-semibold">Item</th>
            <th className="py-2 text-center font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">Line total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.sku} className="border-b align-top">
              <td className="space-y-0.5 py-3">
                <p className="font-medium">{i.title}</p>
                <p className="font-mono text-[12px] text-muted-foreground">SKU {i.sku}</p>
                {i.serials.length > 0 && (
                  <p className="font-mono text-[12px] text-muted-foreground">
                    IMEI/Serial {i.serials.join(', ')}
                  </p>
                )}
                {i.warrantyMonths > 0 && (
                  <p className="text-[12px] text-muted-foreground">
                    {i.warrantyMonths}-month warranty
                  </p>
                )}
              </td>
              <td className="py-3 text-center tabular-nums">{i.qty}</td>
              <td className="py-3 text-right tabular-nums">{formatGHS(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto max-w-xs space-y-1 text-sm tabular-nums">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatGHS(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd>{order.shippingFee === 0 ? 'Free' : formatGHS(order.shippingFee)}</dd>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Discount</dt>
            <dd>−{formatGHS(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <dt>Total ({order.currency})</dt>
          <dd className="font-display tracking-tight">{formatGHS(order.total)}</dd>
        </div>
      </dl>

      <footer className="space-y-1 border-t pt-4 text-[12px] text-muted-foreground">
        <p className="font-medium text-foreground">
          Keep this invoice. It&apos;s your warranty record.
        </p>
        {order.payment?.reference && (
          <p>
            Paystack reference <span className="font-mono">{order.payment.reference}</span>
          </p>
        )}
      </footer>

      <PrintButton />
    </main>
  );
}
