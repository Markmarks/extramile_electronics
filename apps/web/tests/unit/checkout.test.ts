import { createOrderSchema } from '@extramile/core';
import { describe, expect, it } from 'vitest';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('create-order input (T-SEC-03 tamper guard)', () => {
  it('strips client-supplied prices/totals — server prices from DB only', () => {
    const parsed = createOrderSchema.parse({
      email: 'Buyer@Example.com',
      phone: '0244123456',
      zoneId: UUID,
      shipTo: {
        recipient: 'Ama',
        phone: '0244123456',
        line1: '1 Ring Rd',
        city: 'Accra',
        region: 'Greater Accra',
      },
      // hostile extras that must be ignored:
      price: 1,
      total: 1,
      subtotal: 1,
      lines: [{ variantId: UUID, qty: 2, price: 1 }],
    });

    expect(parsed).not.toHaveProperty('price');
    expect(parsed).not.toHaveProperty('total');
    expect(parsed).not.toHaveProperty('subtotal');
    expect(parsed.lines?.[0]).not.toHaveProperty('price');
    // normalisation still happens
    expect(parsed.email).toBe('buyer@example.com');
    expect(parsed.phone).toBe('+233244123456');
  });

  it('rejects a missing zone', () => {
    const res = createOrderSchema.safeParse({
      email: 'a@b.com',
      phone: '0244123456',
      shipTo: { recipient: 'A', phone: '0244123456', line1: 'x', city: 'Accra', region: 'GA' },
    });
    expect(res.success).toBe(false);
  });
});
