import { emailSchema, ORDER_NUMBER_RE } from '@extramile/core';
import { z } from 'zod';

/** Input for the guest order lookup (order number + the email used at checkout). */
export const trackSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ORDER_NUMBER_RE, 'Enter the order number from your confirmation email.'),
  email: emailSchema,
});

/** What a guest may see about an order: progress only — no address, phone or payment ref. */
export interface TrackedOrder {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  items: { title: string; qty: number }[];
}

export type TrackState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'found'; order: TrackedOrder };

/** One message for both "no such order" and "wrong email", so lookups can't probe numbers. */
export const TRACK_NOT_FOUND =
  "We couldn't find an order with that number and email. Check both and try again.";
