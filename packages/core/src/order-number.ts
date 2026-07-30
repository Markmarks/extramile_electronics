/**
 * Order-number generation. Display/local mirror of the RPC's
 * `'EL-' || to_char(now(),'YYYYMMDD') || '-' || upper(hex(3 random bytes))`.
 * U-12: matches `^EL-\d{8}-[A-F0-9]{6}$`, no collisions over 10k iterations.
 */

export const ORDER_NUMBER_RE = /^EL-\d{8}-[A-F0-9]{6}$/;

type RandomBytes = (n: number) => Uint8Array;

const webCryptoBytes: RandomBytes = (n) => {
  const arr = new Uint8Array(n);
  globalThis.crypto.getRandomValues(arr);
  return arr;
};

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function generateOrderNumber(
  date: Date = new Date(),
  rng: RandomBytes = webCryptoBytes,
): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  const suffix = bytesToHex(rng(3)).toUpperCase().slice(0, 6);
  return `EL-${y}${m}${d}-${suffix}`;
}
