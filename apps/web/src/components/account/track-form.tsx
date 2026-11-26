'use client';

import { formatGHS } from '@extramile/core';
import { useActionState } from 'react';
import { OrderTimeline } from '@/components/account/order-timeline';
import { StatusPill } from '@/components/account/status-pill';
import type { TrackState } from '@/lib/orders/track';
import { trackOrderAction } from '@/lib/orders/track-action';

/** Posts (never GETs) so the email never lands in the URL, history or server logs. */
export function TrackForm() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrderAction, {
    status: 'idle',
  });

  return (
    <div className="space-y-6">
      <form action={action} className="panel space-y-4">
        <div>
          <label htmlFor="orderNumber" className="field-label">
            Order number
          </label>
          <input
            id="orderNumber"
            name="orderNumber"
            required
            autoComplete="off"
            placeholder="EL-20261125-A1B2C3"
            className="field font-mono uppercase"
          />
        </div>
        <div>
          <label htmlFor="email" className="field-label">
            Email used at checkout
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="field"
          />
        </div>
        {state.status === 'error' && (
          <p role="alert" className="text-[13px] font-medium text-destructive">
            {state.error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? 'Looking up…' : 'Track order'}
        </button>
      </form>

      {state.status === 'found' && (
        <section className="space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-mono text-xl font-semibold">{state.order.orderNumber}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                Placed {new Date(state.order.createdAt).toLocaleDateString()}
                <StatusPill value={state.order.paymentStatus} />
              </p>
            </div>
            <p className="font-display text-lg font-semibold tabular-nums">
              {formatGHS(state.order.total)}
            </p>
          </div>
          <OrderTimeline status={state.order.status} />
          <ul className="grouped">
            {state.order.items.map((i, n) => (
              <li key={n} className="flex justify-between px-4 py-3 text-[15px]">
                <span>{i.title}</span>
                <span className="text-muted-foreground">× {i.qty}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
