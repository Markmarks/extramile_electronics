import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA512 of the RAW request body, per docs/01-PRD.md §4.5 / test U-21..U-23.
 * The signature MUST be computed over the exact received bytes — never over a
 * parsed-then-restringified body (U-23).
 */
export function computeSignature(rawBody: string, secret: string): string {
  return createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
}

export function verifyPaystackSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = computeSignature(rawBody, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
