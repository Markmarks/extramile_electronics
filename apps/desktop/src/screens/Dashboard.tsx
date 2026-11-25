import { formatGHS } from '@extramile/core';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Inbox,
  PackageCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { loadDashboard, type DashboardData } from '../lib/dashboard';
import { listVariantStock } from '../lib/inventory';
import type { View } from './Shell';

const LOW_STOCK = 3;

export function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [lowStock, setLowStock] = useState<number | null>(null);

  useEffect(() => {
    void loadDashboard().then(setData);
    void listVariantStock().then((rows) =>
      setLowStock(rows.filter((v) => v.available < LOW_STOCK).length),
    );
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();
  const pipeline = [
    { key: 'confirmed', label: 'To pack', icon: Inbox },
    { key: 'packed', label: 'To dispatch', icon: PackageCheck },
    { key: 'dispatched', label: 'Out for delivery', icon: Truck },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={greeting}
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        actions={
          <button type="button" className="btn-primary" onClick={() => onNavigate('orders')}>
            Open order queue <ArrowRight className="size-3.5" aria-hidden />
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sales today"
          icon={Banknote}
          tone="text-success"
          value={data ? formatGHS(data.salesToday) : '—'}
          hint="Paid orders since midnight"
        />
        <StatCard
          label="Orders today"
          icon={ShoppingBag}
          tone="text-primary"
          value={data?.ordersToday ?? '—'}
          hint="All payment states"
        />
        <StatCard
          label="Awaiting fulfilment"
          icon={Inbox}
          tone="text-primary"
          value={data ? data.toFulfil.confirmed + data.toFulfil.packed : '—'}
          hint="Confirmed or packed"
        />
        <button type="button" className="text-left" onClick={() => onNavigate('inventory')}>
          <StatCard
            label="Low stock"
            icon={AlertTriangle}
            tone={lowStock ? 'text-warning' : 'text-muted-foreground'}
            value={lowStock ?? '—'}
            hint={`Variants with fewer than ${LOW_STOCK} available`}
          />
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Recent orders</h2>
            <button type="button" className="btn-ghost" onClick={() => onNavigate('orders')}>
              View all
            </button>
          </div>
          {!data ? (
            <p className="px-4 py-8 text-center text-muted-foreground">Loading…</p>
          ) : data.recent.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No orders yet"
              body="Orders placed on the storefront appear here as soon as they're created."
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <p className="font-medium">{o.order_number}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(o.created_at).toLocaleString()}
                      </p>
                    </td>
                    <td className="max-w-[12rem] truncate text-muted-foreground">{o.email}</td>
                    <td>
                      <StatusBadge value={o.status} />
                    </td>
                    <td>
                      <StatusBadge value={o.payment_status} />
                    </td>
                    <td className="text-right font-medium tabular-nums">{formatGHS(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card h-fit">
          <div className="card-header">
            <h2 className="card-title">Fulfilment</h2>
          </div>
          <ul className="divide-y">
            {pipeline.map(({ key, label, icon: Icon }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onNavigate('orders')}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="flex-1 font-medium">{label}</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {data ? data.toFulfil[key] : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
