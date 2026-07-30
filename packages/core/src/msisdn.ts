/**
 * Ghana MSISDN normalisation to E.164 `+233XXXXXXXXX`.
 * U-11: `0244123456`, `244123456`, `+233244123456` → `+233244123456`;
 *       `+2330244…` rejected.
 */

export class InvalidMsisdnError extends Error {
  constructor(input: string) {
    super(`INVALID_MSISDN: ${input}`);
    this.name = 'InvalidMsisdnError';
  }
}

/** The 9-digit national significant number, first digit 1–9 (leading 0 already stripped). */
const NSN = /^[1-9]\d{8}$/;

export function normalizeMsisdn(input: string): string {
  const cleaned = input.replace(/[\s\-().]/g, '');

  let nsn: string;
  if (cleaned.startsWith('+233')) {
    nsn = cleaned.slice(4);
  } else if (cleaned.startsWith('233')) {
    nsn = cleaned.slice(3);
  } else if (cleaned.startsWith('0')) {
    nsn = cleaned.slice(1);
  } else {
    nsn = cleaned;
  }

  if (!NSN.test(nsn)) {
    throw new InvalidMsisdnError(input);
  }
  return `+233${nsn}`;
}

export function isValidMsisdn(input: string): boolean {
  try {
    normalizeMsisdn(input);
    return true;
  } catch {
    return false;
  }
}
