'use client';

import { canTransition, type OrderStatus } from '@extramile/core';
import { Button } from '@extramile/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { advanceOrderAction } from '@/lib/orders/actions';

const FORWARD: OrderStatus[] = ['confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'];

export function OrderTransition({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go(to: OrderStatus) {
    setError(null);
    start(async () => {
      const res = await advanceOrderAction(orderId, to);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const options = FORWARD.filter((s) => canTransition(status, s));
  if (options.length === 0)
    return <p className="text-sm text-muted-foreground">No further actions.</p>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === 'cancelled' ? 'destructive' : 'default'}
          disabled={pending}
          onClick={() => go(s)}
        >
          Mark {s}
        </Button>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
