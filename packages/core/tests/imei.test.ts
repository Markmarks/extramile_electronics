import { describe, expect, it } from 'vitest';
import { isValidImei, luhnValid } from '../src/imei';

describe('D-12: IMEI Luhn validation', () => {
  it('accepts a valid 15-digit IMEI', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('49015420 3237518')).toBe(true); // whitespace tolerated
  });

  it('rejects a wrong check digit', () => {
    expect(isValidImei('490154203237519')).toBe(false);
  });

  it('rejects wrong length or non-digits', () => {
    expect(isValidImei('12345')).toBe(false);
    expect(isValidImei('4901542032375180')).toBe(false); // 16 digits
    expect(isValidImei('49015420323751X')).toBe(false);
  });

  it('luhnValid works on arbitrary digit strings', () => {
    expect(luhnValid('79927398713')).toBe(true);
    expect(luhnValid('79927398710')).toBe(false);
  });
});
