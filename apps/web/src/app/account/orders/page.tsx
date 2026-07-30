import { formatGHS } from '@extramile/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { listUserOrders } from '@/lib/orders/queries';

export const metadata: Metadata = { title: 'Your orders' };
export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const orders = await listUserOrders();

  return (
    <main className="container max-w-2xl space-y-6 py-10">
      <h1 className="text-2xl font-semibold">Your orders</h1>
      {orders.length === 0 ? (
        <p className="text-muted-foreground">You have no orders yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {orders.map((o) => (
            <li key={o.orderNumber}>
              <Link
                href={`/account/orders/${o.orderNumber}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-accent/5"
              >
                <div>
                  <p className="font-medium">{o.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString()} · {o.status} · {o.paymentStatus}
                  </p>
                </div>
                <span className="font-medium">{formatGHS(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
