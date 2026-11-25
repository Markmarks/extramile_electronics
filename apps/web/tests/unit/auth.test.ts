import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sanitizeNext } from '../../src/lib/auth/next';

const ORIGIN = 'https://www.dnvmart.com';

describe('sanitizeNext (O-06 open-redirect guard)', () => {
  it('keeps safe same-origin paths', () => {
    expect(sanitizeNext('/account')).toBe('/account');
    expect(sanitizeNext('/c/phones?brand=apple')).toBe('/c/phones?brand=apple');
    expect(sanitizeNext('/p/iphone-15#reviews')).toBe('/p/iphone-15#reviews');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/');
    expect(sanitizeNext('//evil.com')).toBe('/');
    expect(sanitizeNext('/\\evil.com')).toBe('/');
    expect(sanitizeNext('http://evil.com')).toBe('/');
  });

  // V-03: the URL parser drops tab/CR/LF, so "/\t/evil.com" used to become //evil.com.
  it('rejects paths the URL parser turns into another origin', () => {
    for (const raw of [
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r/evil.com',
      '/\t\\evil.com',
      '/.//evil.com',
    ]) {
      const out = sanitizeNext(raw);
      expect(new URL(out, ORIGIN).origin, JSON.stringify(raw)).toBe(ORIGIN);
      expect(out.startsWith('//'), JSON.stringify(raw)).toBe(false);
    }
  });

  it('falls back for empty / missing values', () => {
    expect(sanitizeNext(null)).toBe('/');
    expect(sanitizeNext(undefined)).toBe('/');
    expect(sanitizeNext('')).toBe('/');
    expect(sanitizeNext('relative/path')).toBe('/');
  });

  it('property: whatever comes in, the redirect stays on our origin', () => {
    const tricky = fc.constantFrom(
      '/',
      '\\',
      '\t',
      '\n',
      '\r',
      '.',
      '%',
      ':',
      '@',
      '?',
      '#',
      'evil.com',
      ' ',
    );
    const input = fc.oneof(
      fc.string(),
      fc.array(tricky, { maxLength: 12 }).map((xs) => xs.join('')),
      fc.array(tricky, { maxLength: 12 }).map((xs) => `/${xs.join('')}`),
    );
    fc.assert(
      fc.property(input, (raw) => {
        const out = sanitizeNext(raw);
        expect(out.startsWith('/')).toBe(true);
        expect(out.startsWith('//')).toBe(false);
        expect(new URL(out, ORIGIN).origin).toBe(ORIGIN);
      }),
    );
  });
});
