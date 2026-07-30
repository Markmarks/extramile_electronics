import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isTerminal,
  nextStatuses,
} from '../src/order-state';

describe('order state machine', () => {
  it('allows the happy-path fulfilment flow', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'packed')).toBe(true);
    expect(canTransition('packed', 'dispatched')).toBe(true);
    expect(canTransition('dispatched', 'delivered')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('pending', 'delivered')).toBe(false);
    expect(canTransition('delivered', 'pending')).toBe(false);
    expect(() => assertTransition('pending', 'dispatched')).toThrow(InvalidTransitionError);
  });

  it('marks terminal states', () => {
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('refunded')).toBe(true);
    expect(isTerminal('pending')).toBe(false);
    expect(nextStatuses('refunded')).toHaveLength(0);
  });

  it('oversold can be refunded or cancelled', () => {
    expect(canTransition('oversold', 'refunded')).toBe(true);
    expect(canTransition('oversold', 'cancelled')).toBe(true);
  });
});
