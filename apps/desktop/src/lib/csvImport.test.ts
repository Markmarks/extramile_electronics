import { toCsv } from '@extramile/core';
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_ROWS, planImport, type ImportVariant } from './csvImport';

const variants: ImportVariant[] = [
  { id: 'v1', sku: 'P8-128', price: 899_900, stock: 5, reserved: 1 },
  { id: 'v2', sku: 'CABLE', price: 2_500, stock: 40, reserved: 0 },
];

describe('planImport', () => {
  it('plans price and stock changes by SKU (case-insensitive), skipping unchanged rows', () => {
    const plan = planImport(
      'SKU,Price,Stock\r\np8-128,"GH₵ 8,499.00",7\r\nCABLE,25.00,40\r\n',
      variants,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.changes).toEqual([
      {
        line: 2,
        sku: 'P8-128',
        variantId: 'v1',
        price: { from: 899_900, to: 849_900 },
        stock: { from: 5, to: 7 },
      },
    ]);
  });

  it('reports every bad row with its line number and writes nothing for it', () => {
    const plan = planImport(
      [
        'sku,price,stock',
        'NOPE,10,1', // unknown SKU
        'P8-128,-5,', // bad price
        'CASE,,abc', // bad stock
        ',1,1', // empty SKU
        'BUDS,,1', // below the 2 reserved
        'CABLE,30,', // fine
        'cable,31,', // duplicate of the line above
      ].join('\n'),
      [
        ...variants,
        { id: 'v3', sku: 'CASE', price: 5_000, stock: 3, reserved: 0 },
        { id: 'v4', sku: 'BUDS', price: 9_000, stock: 4, reserved: 2 },
      ],
    );
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 8]);
    expect(plan.changes).toEqual([
      { line: 7, sku: 'CABLE', variantId: 'v2', price: { from: 2_500, to: 3_000 } },
    ]);
  });

  it('needs a sku column and at least one of price/stock', () => {
    expect(planImport('name,price\nx,1', variants).errors[0]!.message).toMatch(/sku/);
    expect(planImport('sku,name\nCABLE,x', variants).errors[0]!.message).toMatch(/price/);
    expect(planImport('sku,price\n', variants).errors[0]!.message).toMatch(/no data/);
  });

  it(`refuses more than ${MAX_IMPORT_ROWS} rows`, () => {
    const big = ['sku,stock', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => 'CABLE,1')];
    expect(planImport(big.join('\n'), variants).errors[0]!.message).toMatch(/Too many/);
  });

  // parseCedisText itself has fast-check properties in packages/core/tests/properties.test.ts.
  it('any planned price is a positive integer number of pesewas', () => {
    const tricky = ['0.1', '0.10', '1e3', '12.345', ' 7 ', '1,000', 'GHS 9.99', '0', '', '"'];
    for (const price of tricky) {
      const plan = planImport(
        toCsv([
          ['sku', 'price'],
          ['CABLE', price],
        ]),
        variants,
      );
      for (const c of plan.changes)
        if (c.price) expect(Number.isSafeInteger(c.price.to) && c.price.to > 0).toBe(true);
    }
  });
});
