import { describe, expect, it } from 'vitest';
import { sanitizeNext } from '../../src/lib/auth/next';

describe('sanitizeNext (O-06 open-redirect guard)', () => {
  it('keeps safe same-origin paths', () => {
    expect(sanitizeNext('/account')).toBe('/account');
    expect(sanitizeNext('/c/phones?brand=apple')).toBe('/c/phones?brand=apple');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/');
    expect(sanitizeNext('//evil.com')).toBe('/');
    expect(sanitizeNext('/\\evil.com')).toBe('/');
    expect(sanitizeNext('http://evil.com')).toBe('/');
  });

  it('falls back for empty / missing values', () => {
    expect(sanitizeNext(null)).toBe('/');
    expect(sanitizeNext(undefined)).toBe('/');
    expect(sanitizeNext('')).toBe('/');
    expect(sanitizeNext('relative/path')).toBe('/');
  });
});
