import { formatGHS } from '@extramile/core';

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

function layout(heading: string, bodyHtml: string): string {
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1120">
    <h1 style="font-size:20px;color:#1F3A68">ExtraMile Electronics</h1>
    <h2 style="font-size:16px">${heading}</h2>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #E4E8EE;margin:24px 0" />
    <p style="font-size:12px;color:#5B6672">ExtraMile Electronics · Accra, Ghana</p>
  </div>`;
}

function itemsTable(data: OrderEmailData): string {
  const rows = data.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 0">${i.title} × ${i.qty}</td><td style="padding:4px 0;text-align:right">${formatGHS(i.lineTotal)}</td></tr>`,
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
    <tr><td style="padding-top:8px;font-weight:600;border-top:1px solid #E4E8EE">Total</td>
    <td style="padding-top:8px;font-weight:600;border-top:1px solid #E4E8EE;text-align:right">${formatGHS(data.total)}</td></tr>
  </table>`;
}

export function orderConfirmation(d: OrderEmailData): Email {
  return {
    subject: `We received order ${d.orderNumber}`,
    html: layout(
      `Order ${d.orderNumber} received`,
      `<p>Thanks! We're getting your order ready. Here's what you ordered:</p>${itemsTable(d)}`,
    ),
  };
}

export function paymentReceipt(d: OrderEmailData): Email {
  return {
    subject: `Payment received — order ${d.orderNumber}`,
    html: layout(
      `Payment confirmed`,
      `<p>Your payment for order ${d.orderNumber} is confirmed${d.reference ? ` (ref ${d.reference})` : ''}.</p>${itemsTable(d)}`,
    ),
  };
}

export function dispatchEmail(d: OrderEmailData): Email {
  return {
    subject: `Order ${d.orderNumber} is on its way`,
    html: layout(
      'Dispatched',
      `<p>Order ${d.orderNumber} has been dispatched and is on its way to you.</p>`,
    ),
  };
}

export function deliveryEmail(d: OrderEmailData): Email {
  return {
    subject: `Order ${d.orderNumber} delivered`,
    html: layout(
      'Delivered',
      `<p>Order ${d.orderNumber} was delivered. Enjoy — and keep this email for your warranty.</p>`,
    ),
  };
}

export function refundEmail(d: OrderEmailData): Email {
  return {
    subject: `Refund processed — order ${d.orderNumber}`,
    html: layout(
      'Refund processed',
      `<p>We've processed a refund for order ${d.orderNumber}. It may take a few days to reflect.</p>`,
    ),
  };
}
