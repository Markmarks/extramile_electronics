import { formatGHS } from '@extramile/core';
import { FileText, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderTimeline } from '@/components/account/order-timeline';
import { StatusPill } from '@/components/account/status-pill';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { getUserOrder } from '@/lib/orders/queries';
import { getReviewableItems, type ReviewableItem } from '@/lib/reviews/queries';

export const metadata: Metadata = { title: 'Order' };
export const dynamic = 'force-dynamic';

function ReviewLink({ item }: { item: ReviewableItem | undefined }) {
  if (!item) return null;
  if (item.reviewed)
    return (
      <p className="pt-1 text-[13px] text-muted-foreground">
        {item.published ? 'You reviewed this.' : 'Your review is awaiting approval.'}
      </p>
    );
  return (
    <Link
      href={`/p/${item.slug}#write-review`}
      className="inline-flex items-center gap-1 pt-1 text-[13px] font-medium text-primary"
    >
      <Star className="size-3.5" aria-hidden /> Write a review
    </Link>
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

  const reviewable =
    order.status === 'delivered'
      ? await getReviewableItems(
          order.items.flatMap((i) => (i.variantId ? [i.variantId] : [])),
        ).catch(() => new Map<string, ReviewableItem>())
      : new Map<string, ReviewableItem>();

  return (
    <main className="container max-w-2xl space-y-6 pb-20 pt-6">
      <div>
        <Breadcrumbs
          trail={[
            { label: 'Account', href: '/account' },
            { label: 'Orders', href: '/account/orders' },
            { label: order.orderNumber },
          ]}
        />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              Placed {new Date(order.createdAt).toLocaleString()}
              <StatusPill value={order.paymentStatus} />
            </p>
          </div>
          <Link href={`/account/orders/${order.orderNumber}/invoice`} className="btn-tinted btn-sm">
            <FileText className="size-4" aria-hidden /> Invoice
          </Link>
        </div>
      </div>

      <OrderTimeline status={order.status} />

      <ul className="grouped">
        {order.items.map((item) => (
          <li key={item.sku} className="flex justify-between gap-4 px-4 py-3.5">
            <div className="space-y-0.5">
              <p className="text-[15px] font-semibold">
                {item.title} <span className="text-muted-foreground">× {item.qty}</span>
              </p>
              <p className="text-[13px] text-muted-foreground">
                SKU {item.sku}
                {item.warrantyMonths > 0 && ` · ${item.warrantyMonths}-mo warranty`}
              </p>
              {item.serials.length > 0 && (
                <p className="font-mono text-[12px] text-muted-foreground">
                  IMEI/Serial: {item.serials.join(', ')}
                </p>
              )}
              <ReviewLink item={item.variantId ? reviewable.get(item.variantId) : undefined} />
            </div>
            <span className="text-[15px] font-medium">{formatGHS(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <dl className="panel space-y-2 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatGHS(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd>{order.shippingFee === 0 ? 'Free' : formatGHS(order.shippingFee)}</dd>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-success">
            <dt>Discount</dt>
            <dd>−{formatGHS(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-foreground/[0.06] pt-3 text-[17px] font-bold">
          <dt>Total</dt>
          <dd className="font-display tabular-nums tracking-tight">{formatGHS(order.total)}</dd>
        </div>
        {order.payment?.reference && (
          <p className="pt-1 text-[13px] text-muted-foreground">
            Paystack ref: {order.payment.reference}
          </p>
        )}
      </dl>
    </main>
  );
}
