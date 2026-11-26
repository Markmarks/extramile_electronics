import { describe, expect, it } from 'vitest';
import { cleanSerials, salePayload, saleTotal, type SaleInput } from './walkInSale';

const input: SaleInput = {
  lines: [
    {
      variantId: 'v1',
      sku: 'P8',
      title: 'Pixel 8',
      price: 899_900,
      qty: 1,
      serials: ['356938035643809'],
    },
    { variantId: 'v2', sku: 'CAB', title: 'Cable', price: 2_500, qty: 3, serials: [] },
  ],
  method: 'cash',
  customer: '  Ama ',
  phone: '',
  email: ' ',
};

describe('walk-in sale', () => {
  it('on-screen total is integer pesewas', () => {
    expect(saleTotal(input.lines)).toBe(907_400);
  });

  it('never sends a price — only ids, quantities and serials', () => {
    const p = salePayload(input, 'local-ABC');
    expect(JSON.stringify(p)).not.toMatch(/price|total/);
    expect(p).toEqual({
      items: [
        { variant_id: 'v1', qty: 1, serials: ['356938035643809'] },
        { variant_id: 'v2', qty: 3, serials: [] },
      ],
      method: 'cash',
      customer: 'Ama',
      phone: null,
      email: null,
      local_ref: 'local-ABC',
    });
  });

  it('cleanSerials keeps at most one per unit, de-duplicated', () => {
    expect(cleanSerials('111, 222 222\n333;', 2)).toEqual(['111', '222']);
    expect(cleanSerials('  ', 3)).toEqual([]);
  });
});
