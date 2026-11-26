import { formatGHS } from '@extramile/core';
import type { OrderDetail } from './orders';
import type { ReceiptDto } from './print';

/** Thermal receipt in the brand voice (docs/brand §08); one ESC/POS line per \n. */
export function buildReceipt(detail: OrderDetail): ReceiptDto {
  const warranty = detail.items
    .flatMap((i) => [
      ...(i.serials.length ? [`${i.sku} IMEI/Serial ${i.serials.join(', ')}`] : []),
      ...(i.warranty_months > 0 ? [`${i.sku} ${i.warranty_months}-month warranty`] : []),
    ])
    .join('\n');
  return {
    header: 'extramile',
    order_number: detail.order_number,
    lines: detail.items.map((i) => ({
      name: i.title,
      qty: i.qty,
      line_total: formatGHS(i.line_total),
    })),
    total: formatGHS(detail.total),
    warranty: warranty || null,
    payment_note:
      detail.channel === 'walk_in'
        ? `Paid in store${detail.notes ? ` (${detail.notes.replace(/^Walk-in sale · /, '')})` : ''}`
        : null,
  };
}
