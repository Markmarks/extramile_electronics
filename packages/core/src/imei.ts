/**
 * IMEI / serial validation for scan-to-capture (docs/07-DESKTOP-ADMIN.md §6, D-12).
 * IMEI is 15 digits with a Luhn check digit.
 */

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isValidImei(input: string): boolean {
  const s = input.replace(/[\s-]/g, '');
  return /^\d{15}$/.test(s) && luhnValid(s);
}
