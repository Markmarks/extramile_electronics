import { STAFF_FULFILMENT_FLOW } from '@extramile/core';
import { describe, expect, it } from 'vitest';
import { trackerProgress, trackerStops } from '@/lib/orders/tracker';

describe('order tracker', () => {
  it('marks earlier steps done, the status current, later steps todo', () => {
    expect(trackerStops('packed').map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(trackerStops('dispatched').map((s) => s.label)).toEqual([
      'Paid',
      'Packed',
      'On the way',
      'Delivered',
    ]);
  });

  it('treats the final step as done, not current', () => {
    const stops = trackerStops('delivered');
    expect(stops.every((s) => s.state === 'done')).toBe(true);
    expect(trackerProgress(stops)).toBe(1);
  });

  it('shows nothing done for a status outside the flow', () => {
    const stops = trackerStops('pending');
    expect(stops.every((s) => s.state === 'todo')).toBe(true);
    expect(trackerProgress(stops)).toBe(0);
  });

  it('has exactly one current stop for every in-flow status except the last', () => {
    STAFF_FULFILMENT_FLOW.forEach((status, i) => {
      const current = trackerStops(status).filter((s) => s.state === 'current').length;
      expect(current).toBe(i === STAFF_FULFILMENT_FLOW.length - 1 ? 0 : 1);
      expect(trackerProgress(trackerStops(status))).toBeCloseTo(
        i / (STAFF_FULFILMENT_FLOW.length - 1),
      );
    });
  });
});
