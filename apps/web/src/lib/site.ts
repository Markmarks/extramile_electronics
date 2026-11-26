/**
 * Public shop details shown in the footer and on the help/legal pages. All optional:
 * set them in the hosting env (they are public, so NEXT_PUBLIC_ is fine). A missing value
 * is simply not shown — never a made-up number or address.
 */
export const site = {
  name: 'ExtraMile Electronics',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null,
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || null,
  whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() || null,
  address: process.env.NEXT_PUBLIC_STORE_ADDRESS?.trim() || null,
  hours: process.env.NEXT_PUBLIC_STORE_HOURS?.trim() || null,
} as const;

/**
 * Shop policy numbers used in the help/legal copy. DRAFT values — the owner must confirm
 * them (and have the legal pages reviewed) before launch.
 */
export const policy = {
  /** Days after delivery to report a fault or wrong item. */
  returnWindowDays: 7,
  /** Unpaid orders release their reserved stock after this many minutes. */
  reservationMinutes: 15,
} as const;

/** Date the legal pages below were last revised (shown on each page). */
export const LEGAL_UPDATED = '25 November 2026';
