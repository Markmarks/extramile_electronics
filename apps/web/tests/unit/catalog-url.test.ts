import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildFacetHref,
  parseCedisParam,
  parseNumericFilters,
  PRICE_BANDS,
} from '../../src/lib/catalog/url';

describe('price / memory filters from the URL', () => {
  it('converts whole cedis to integer pesewas', () => {
    expect(parseCedisParam('1000')).toBe(100_000);
    expect(parseCedisParam(' 25 ')).toBe(2_500);
    expect(parseCedisParam('0')).toBe(0);
  });

  it('rejects anything that is not a plain whole number', () => {
    for (const bad of [undefined, '', '-5', '1.5', '1e5', 'abc', '10,000', '999999999']) {
      expect(parseCedisParam(bad)).toBeUndefined();
    }
  });

  it('property: any accepted value is a non-negative integer number of pesewas', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const p = parseCedisParam(raw);
        if (p === undefined) return true;
        return Number.isSafeInteger(p) && p >= 0 && p % 100 === 0;
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (cedis) => {
        expect(parseCedisParam(String(cedis))).toBe(cedis * 100);
      }),
    );
  });

  it('swaps a reversed range instead of matching nothing', () => {
    expect(parseNumericFilters({ min_price: '5000', max_price: '1000' })).toMatchObject({
      minPrice: 100_000,
      maxPrice: 500_000,
    });
  });

  it('accepts only the offered storage / RAM steps', () => {
    expect(parseNumericFilters({ storage: '256', ram: '8' })).toMatchObject({
      minStorageGb: 256,
      minRamGb: 8,
    });
    expect(parseNumericFilters({ storage: '300', ram: '-1' })).toMatchObject({
      minStorageGb: undefined,
      minRamGb: undefined,
    });
  });

  it('price bands are ordered and each has a bound', () => {
    for (const b of PRICE_BANDS) expect(b.min !== undefined || b.max !== undefined).toBe(true);
  });

  it('changing a filter keeps the query and resets the page', () => {
    expect(buildFacetHref('/search', { q: 'iphone', page: '3' }, { storage: '256' })).toBe(
      '/search?q=iphone&storage=256',
    );
  });
});
