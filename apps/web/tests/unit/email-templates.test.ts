import { describe, expect, it } from 'vitest';
import {
  deliveryEmail,
  dispatchEmail,
  escapeHtml,
  orderConfirmation,
  paymentReceipt,
  refundEmail,
  type OrderEmailData,
} from '@/lib/email/templates';

const data: OrderEmailData = {
  orderNumber: 'EM-2611-0482',
  total: 533400,
  items: [{ title: 'Galaxy A55 5G <b>256GB</b>', qty: 1, lineTotal: 529900 }],
  reference: 'ps_"ref"<x>',
};

describe('email templates', () => {
  const all = [orderConfirmation, paymentReceipt, dispatchEmail, deliveryEmail, refundEmail];

  it('names the order in every subject and body', () => {
    for (const t of all) {
      const e = t(data);
      expect(e.subject).toContain('EM-2611-0482');
      expect(e.html).toContain('EM-2611-0482');
    }
  });

  it('escapes product titles and references', () => {
    const html = paymentReceipt(data).html;
    expect(html).toContain('Galaxy A55 5G &lt;b&gt;256GB&lt;/b&gt;');
    expect(html).not.toContain('<b>256GB</b>');
    expect(html).toContain('ps_&quot;ref&quot;&lt;x&gt;');
  });

  it('shows money in cedis from pesewas', () => {
    expect(paymentReceipt(data).html).toContain('5,334.00');
  });

  it('keeps the voice plain: no exclamation marks', () => {
    for (const t of all) expect(t(data).html).not.toMatch(/!/);
  });

  it('escapeHtml covers the five special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
