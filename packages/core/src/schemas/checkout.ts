import { z } from 'zod';
import { cartLineInputSchema, emailSchema, msisdnSchema, uuidSchema } from './common';

export const contactSchema = z.object({
  email: emailSchema,
  phone: msisdnSchema,
});
export type ContactInput = z.infer<typeof contactSchema>;

export const addressSchema = z.object({
  recipient: z.string().trim().min(1).max(120),
  phone: msisdnSchema,
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120),
  landmark: z.string().trim().max(200).optional().or(z.literal('')),
});
export type AddressInput = z.infer<typeof addressSchema>;

/**
 * The complete create-order request. Note: **no prices**. The server recomputes
 * everything from the DB (docs/01-PRD.md §4.4, docs/06 P6).
 */
export const createOrderSchema = z.object({
  email: emailSchema,
  phone: msisdnSchema,
  zoneId: uuidSchema,
  couponCode: z.string().trim().min(1).max(40).optional(),
  shipTo: addressSchema,
  // Server reads the cart by token/user; lines here are only for guest-cart validation.
  lines: z.array(cartLineInputSchema).min(1).max(50).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
