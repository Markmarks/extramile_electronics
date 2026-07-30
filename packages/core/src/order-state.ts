/**
 * Order status state machine. States and terminal set per docs/01-PRD.md §4.6 and
 * the `order_status` enum in docs/02-DATA-MODEL.md §001.
 */

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'oversold';

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled', 'oversold'],
  confirmed: ['packed', 'cancelled', 'refunded'],
  packed: ['dispatched', 'cancelled', 'refunded'],
  dispatched: ['delivered', 'refunded'],
  delivered: ['refunded'],
  oversold: ['refunded', 'cancelled'],
  cancelled: [],
  refunded: [],
};

/** Forward transitions a staff member can drive in the fulfilment UI. */
export const STAFF_FULFILMENT_FLOW: readonly OrderStatus[] = [
  'confirmed',
  'packed',
  'dispatched',
  'delivered',
];

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export class InvalidTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`INVALID_TRANSITION: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
