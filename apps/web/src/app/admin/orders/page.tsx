import { formatGHS } from '@extramile/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { listAdminOrders } from '@/lib/admin/queries';
import { requireStaff } from '@/lib/admin/guard';

export const metadata: Metadata = { title: 'Admin · Orders' };
export const dynamic = 'force-dynamic';

const STATUSES = [
  '',
  'pending',
  'confirmed',
  'packed',
  'dispatched',
  'delivered',
  'oversold',
  'cancelled',
  'refunded',
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaff();
  const { status } = await searchParams;
  const orders = await listAdminOrders(status);

  return (
    <main className="container space-y-6 py-10">
      <h1 className="text-2xl font-semibold">Order queue</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s || 'all'}
            href={s ? `/admin/orders?status=${s}` : '/admin/orders'}
            className={`rounded-full px-3 py-1 ${status === s || (!status && !s) ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            {s || 'all'}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Order</th>
              <th className="py-2">Email</th>
              <th className="py-2">Status</th>
              <th className="py-2">Payment</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderNumber} className="border-b hover:bg-accent/5">
                <td className="py-2">
                  <Link href={`/admin/orders/${o.orderNumber}`} className="font-medium underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="py-2 text-muted-foreground">{o.email}</td>
                <td className="py-2">{o.status}</td>
                <td className="py-2">{o.paymentStatus}</td>
                <td className="py-2 text-right">{formatGHS(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">No orders.</p>
        )}
      </div>
    </main>
  );
}
