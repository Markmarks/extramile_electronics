import { describe, expect, it } from 'vitest';
import { buildReport, type ReportOrder } from './reports';

const order = (
  id: string,
  total: number,
  created_at: string,
  channel: string,
  items: ReportOrder['items'],
): ReportOrder => ({ id, total, created_at, channel, items });

describe('buildReport', () => {
  const orders = [
    order('a', 10_000, '2026-11-20T10:00:00', 'online', [
      { sku: 'P8', title: 'Pixel 8', qty: 1, line_total: 9_000, variant_id: 'v1' },
    ]),
    order('b', 5_000, '2026-11-20T15:00:00', 'walk_in', [
      { sku: 'CAB', title: 'Cable', qty: 5, line_total: 5_000, variant_id: 'v2' },
    ]),
    order('c', 18_000, '2026-11-21T09:00:00', 'online', [
      { sku: 'P8', title: 'Pixel 8', qty: 2, line_total: 18_000, variant_id: 'v1' },
    ]),
  ];

  it('totals by day, channel and net of refunds (integer pesewas)', () => {
    const r = buildReport(
      orders,
      [{ amount: 2_000, created_at: '2026-11-21T12:00:00' }],
      new Map(),
    );
    expect(r.days).toEqual([
      { day: '2026-11-20', orders: 2, gross: 15_000, refunds: 0, net: 15_000 },
      { day: '2026-11-21', orders: 1, gross: 18_000, refunds: 2_000, net: 16_000 },
    ]);
    expect(r.totals).toEqual({
      orders: 3,
      gross: 33_000,
      refunds: 2_000,
      net: 31_000,
      online: 28_000,
      walkIn: 5_000,
      avgOrder: 11_000,
    });
  });

  it('ranks SKUs by revenue and computes margin only when every unit has a cost', () => {
    const r = buildReport(orders, [], new Map([['v1', 7_000]]));
    expect(r.topSkus[0]).toEqual({
      sku: 'P8',
      title: 'Pixel 8',
      qty: 3,
      revenue: 27_000,
      cost: 21_000,
      margin: 6_000,
    });
    expect(r.topSkus[1]).toMatchObject({ sku: 'CAB', cost: null, margin: null });
  });

  it('is empty for no data', () => {
    const r = buildReport([], [], new Map());
    expect(r.days).toEqual([]);
    expect(r.totals.avgOrder).toBe(0);
  });
});
