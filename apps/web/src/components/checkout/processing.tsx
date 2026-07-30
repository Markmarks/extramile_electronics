'use client';

import { Button } from '@extramile/ui';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'polling' | 'paid' | 'failed' | 'timeout';

const MAX_ATTEMPTS = 45; // 45 × 2s ≈ 90s
const INTERVAL = 2000;

/** Polls order status — never trusts Paystack callback query params (docs/01 §4.5). */
export function ProcessingPoller({ orderNumber }: { orderNumber: string }) {
  const [phase, setPhase] = useState<Phase>('polling');
  const attempts = useRef(0);

  const poll = useCallback(() => {
    let active = true;
    attempts.current = 0;
    setPhase('polling');

    const tick = async () => {
      try {
        const res = await fetch(`/api/orders/${orderNumber}/status`, { cache: 'no-store' });
        const d = (await res.json()) as { paymentStatus?: string; status?: string };
        if (!active) return;
        if (d.paymentStatus === 'paid') return setPhase('paid');
        if (d.paymentStatus === 'failed' || d.status === 'cancelled') return setPhase('failed');
      } catch {
        // transient — keep polling
      }
      attempts.current += 1;
      if (attempts.current >= MAX_ATTEMPTS) return setPhase('timeout');
      if (active) setTimeout(tick, INTERVAL);
    };
    void tick();
    return () => {
      active = false;
    };
  }, [orderNumber]);

  useEffect(() => poll(), [poll]);

  if (phase === 'paid') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-success">Payment confirmed</h1>
        <p className="text-muted-foreground">
          Order {orderNumber} is confirmed. We&apos;ve emailed your receipt.
        </p>
        <Button asChild>
          <Link href={`/account/orders/${orderNumber}`}>View your order</Link>
        </Button>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-destructive">Payment didn&apos;t go through</h1>
        <p className="text-muted-foreground">Your cart is intact — you can try again.</p>
        <Button asChild>
          <Link href="/checkout">Try again</Link>
        </Button>
      </div>
    );
  }

  if (phase === 'timeout') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Still confirming…</h1>
        <p className="text-muted-foreground">
          This is taking longer than usual. If you completed payment, it will confirm shortly.
        </p>
        <Button onClick={poll}>Check again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Confirming your payment…</h1>
      <p className="text-muted-foreground">
        Order {orderNumber}. Please keep this page open — this only takes a moment.
      </p>
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}
