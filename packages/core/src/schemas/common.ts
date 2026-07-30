import { z } from 'zod';
import { isValidMsisdn, normalizeMsisdn } from '../msisdn';

/** Ghana MSISDN, normalised to `+233XXXXXXXXX`. */
export const msisdnSchema = z
  .string()
  .trim()
  .refine(isValidMsisdn, { message: 'Enter a valid Ghana phone number' })
  .transform(normalizeMsisdn);

/** Integer pesewas, non-negative. */
export const pesewasSchema = z
  .number()
  .int('Amount must be a whole number of pesewas')
  .nonnegative();

export const emailSchema = z.string().trim().toLowerCase().email();

export const uuidSchema = z.string().uuid();

/** Cart line the client is allowed to send — never a price. */
export const cartLineInputSchema = z.object({
  variantId: uuidSchema,
  qty: z.number().int().min(1).max(20),
});
export type CartLineInput = z.infer<typeof cartLineInputSchema>;
