import { describe, expect, it } from 'vitest';
import { InvalidMsisdnError, isValidMsisdn, normalizeMsisdn } from '../src/msisdn';

describe('U-11: MSISDN normaliser', () => {
  it('normalises all accepted local/international forms to +233XXXXXXXXX', () => {
    expect(normalizeMsisdn('0244123456')).toBe('+233244123456');
    expect(normalizeMsisdn('244123456')).toBe('+233244123456');
    expect(normalizeMsisdn('+233244123456')).toBe('+233244123456');
    expect(normalizeMsisdn('233244123456')).toBe('+233244123456');
    expect(normalizeMsisdn('+233 24 412 3456')).toBe('+233244123456');
    expect(normalizeMsisdn('024-412-3456')).toBe('+233244123456');
  });

  it('rejects a double-zero / wrong-length number', () => {
    expect(() => normalizeMsisdn('+2330244123456')).toThrow(InvalidMsisdnError);
    expect(() => normalizeMsisdn('024412345')).toThrow(); // too short
    expect(() => normalizeMsisdn('02441234567')).toThrow(); // too long
    expect(() => normalizeMsisdn('abc')).toThrow();
  });

  it('isValidMsisdn reflects normaliser', () => {
    expect(isValidMsisdn('0244123456')).toBe(true);
    expect(isValidMsisdn('+2330244123456')).toBe(false);
  });
});
