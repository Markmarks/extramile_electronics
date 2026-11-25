import { STAFF_FULFILMENT_FLOW, type OrderStatus } from '@extramile/core';

export type StopState = 'done' | 'current' | 'todo';

export interface TrackerStop {
  status: OrderStatus;
  label: string;
  state: StopState;
}

/** Customer-facing names for the fulfilment steps. */
const LABELS: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Paid',
  packed: 'Packed',
  dispatched: 'On the way',
  delivered: 'Delivered',
};

/**
 * The "mile line" order tracker (brand book §07): every step before the order's status is
 * done, the status itself is the current stop — except the last step, which is simply done —
 * and the rest are still to come. A status outside the flow (e.g. pending) has nothing done.
 */
export function trackerStops(status: string): TrackerStop[] {
  const flow = STAFF_FULFILMENT_FLOW;
  const idx = flow.indexOf(status as OrderStatus);
  const last = flow.length - 1;
  return flow.map((s, i) => ({
    status: s,
    label: LABELS[s] ?? s.replace(/_/g, ' '),
    state:
      idx < 0
        ? 'todo'
        : i < idx || (i === idx && idx === last)
          ? 'done'
          : i === idx
            ? 'current'
            : 'todo',
  }));
}

/** How far along the line to fill, 0–1: up to the current stop. */
export function trackerProgress(stops: TrackerStop[]): number {
  if (stops.length < 2) return 0;
  const reached = stops.reduce((n, s, i) => (s.state === 'todo' ? n : i), -1);
  return reached <= 0 ? 0 : reached / (stops.length - 1);
}
