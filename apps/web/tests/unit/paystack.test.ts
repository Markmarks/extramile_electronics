import { describe, expect, it } from 'vitest';
import { PaystackError, toPaystackAmount } from '../../src/lib/paystack/client';
import { computeSignature, verifyPaystackSignature } from '../../src/lib/paystack/signature';

const SECRET = 'sk_test_example_secret';

describe('U-20: amount conversion', () => {
  it('passes integer pesewas straight through (GHS 1,299.50 → 129950)', () => {
    expect(toPaystackAmount(129950)).toBe(129950);
  });
  it('rejects non-integer or non-positive amounts', () => {
    expect(() => toPaystackAmount(129950.5)).toThrow(PaystackError);
    expect(() => toPaystackAmount(0)).toThrow(PaystackError);
    expect(() => toPaystackAmount(-100)).toThrow(PaystackError);
  });
});

describe('U-21/U-22: signature verification', () => {
  const raw = '{"event":"charge.success","data":{"reference":"EL-1","amount":129950}}';

  it('U-21: accepts a valid HMAC-SHA512 over the raw body', () => {
    const sig = computeSignature(raw, SECRET);
    expect(verifyPaystackSignature(raw, sig, SECRET)).toBe(true);
  });

  it('U-22: rejects a missing or tampered signature', () => {
    expect(verifyPaystackSignature(raw, null, SECRET)).toBe(false);
    expect(verifyPaystackSignature(raw, 'deadbeef', SECRET)).toBe(false);
    const sig = computeSignature(raw, SECRET);
    expect(verifyPaystackSignature(raw + ' ', sig, SECRET)).toBe(false); // body tampered
  });
});

describe('U-23: signature must be over raw bytes, not a re-stringified body', () => {
  it('re-stringifying changes the digest and fails verification', () => {
    const raw = '{"event":"charge.success","data":{"amount":129950}}';
    const spaced = '{ "event": "charge.success", "data": { "amount": 129950 } }';
    const sigRaw = computeSignature(raw, SECRET);
    expect(computeSignature(spaced, SECRET)).not.toBe(sigRaw);
    // A webhook handler that parsed then re-stringified would compute `spaced` and fail:
    expect(verifyPaystackSignature(spaced, sigRaw, SECRET)).toBe(false);
  });
});
