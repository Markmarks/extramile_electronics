import { formatGHS } from '@extramile/core';

/*
 * Transactional emails in the brand voice (docs/brand §03): say the fact, then stop.
 * Palette H, light only — mail clients ignore our dark tokens. Inline styles only.
 */

export interface OrderEmailData {
  orderNumber: string;
  total: number;
  items: { title: string; qty: number; lineTotal: number }[];
  reference?: string | null;
  support?: string;
}

export interface Email {
  subject: string;
  html: string;
}

const INK = '#0A1120';
const SLATE = '#5B6672';
const HAIRLINE = '#E4E8EE';
const STROKE = '#4470D6';
const MONO = 'ui-monospace,Consolas,Menlo,monospace';

/** Product titles and references come from the database; never trust them as HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const num = (orderNumber: string) =>
  `<span style="font-family:${MONO}">${escapeHtml(orderNumber)}</span>`;

function layout(heading: string, bodyHtml: string): string {
  // Text wordmark + the logo's blue stroke: no remote image for mail clients to block.
  return `<div style="font-family:Inter,'Segoe UI',system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:${INK};line-height:1.5">
    <p style="margin:0 0 24px;font-size:22px;font-weight:800;letter-spacing:-1px">extramile<span style="display:inline-block;width:22px;height:5px;margin-left:4px;border-radius:3px;background:${STROKE};vertical-align:middle"></span></p>
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;letter-spacing:-0.3px">${heading}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid ${HAIRLINE};margin:28px 0 16px" />
    <p style="margin:0;font-size:12px;color:${SLATE}">ExtraMile Electronics · Accra, Ghana</p>
  </div>`;
}

function itemsTable(data: OrderEmailData): string {
  const rows = data.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escapeHtml(i.title)} × ${i.qty}</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${formatGHS(i.lineTotal)}</td></tr>`,
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">${rows}
    <tr><td style="padding-top:10px;font-weight:700;border-top:1px solid ${HAIRLINE}">Total</td>
    <td style="padding-top:10px;font-weight:700;border-top:1px solid ${HAIRLINE};text-align:right;white-space:nowrap">${formatGHS(data.total)}</td></tr>
  </table>`;
}

const p = (html: string) => `<p style="margin:0 0 12px;font-size:15px">${html}</p>`;

export function orderConfirmation(d: OrderEmailData): Email {
  return {
    subject: `Order ${d.orderNumber} received`,
    html: layout(
      'We have your order',
      p(
        `Order ${num(d.orderNumber)} is in. Once your payment is confirmed, we check each item and pack it.`,
      ) + itemsTable(d),
    ),
  };
}

export function paymentReceipt(d: OrderEmailData): Email {
  const ref = d.reference
    ? ` Paystack reference <span style="font-family:${MONO}">${escapeHtml(d.reference)}</span>.`
    : '';
  return {
    subject: `Payment received for order ${d.orderNumber}`,
    html: layout(
      'Payment received',
      p(
        `We received ${formatGHS(d.total)} for order ${num(d.orderNumber)}.${ref} We're checking and packing it now.`,
      ) + itemsTable(d),
    ),
  };
}

export function dispatchEmail(d: OrderEmailData): Email {
  return {
    subject: `Order ${d.orderNumber} is on the way`,
    html: layout(
      'On the way',
      p(`Order ${num(d.orderNumber)} has left our shop and is on its way to you.`),
    ),
  };
}

export function deliveryEmail(d: OrderEmailData): Email {
  return {
    subject: `Order ${d.orderNumber} delivered`,
    html: layout(
      'Delivered',
      p(`Order ${num(d.orderNumber)} was delivered.`) +
        p('Keep this email and your invoice. Together they are your warranty record.'),
    ),
  };
}

export function refundEmail(d: OrderEmailData): Email {
  return {
    subject: `Refund for order ${d.orderNumber}`,
    html: layout(
      'Refund sent',
      p(
        `We've refunded order ${num(d.orderNumber)}. It can take a few days to show in your account.`,
      ),
    ),
  };
}
