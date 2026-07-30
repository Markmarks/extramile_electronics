'use client';

import { formatGHS } from '@extramile/core';
import { Button } from '@extramile/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { removeItemAction, setQtyAction } from '@/lib/cart/actions';
import type { CartLine } from '@/lib/cart/cart';

function attrsLabel(attrs: Record<string, unknown>): string {
  return Object.values(attrs)
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(String)
    .join(' · ');
}

export function CartLineItem({ line }: { line: CartLine }) {
  const router = useRouter();
  const [qty, setQty] = useState(line.qty);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notifyChanged() {
    window.dispatchEvent(new Event('cart:changed'));
    router.refresh();
  }

  function change(next: number) {
    const prev = qty;
    setError(null);
    setQty(Math.max(next, 0)); // optimistic
    startTransition(async () => {
      if (next <= 0) {
        await removeItemAction(line.variantId);
      } else {
        const res = await setQtyAction(line.variantId, next);
        if (!res.ok) {
          setQty(prev);
          setError(res.error);
          return;
        }
        if (res.qty !== next) setQty(res.qty);
      }
      notifyChanged();
    });
  }

  const label = attrsLabel(line.attrs);

  return (
    <li className="flex gap-4 py-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
        {line.imageUrl ? (
          <Image
            src={line.imageUrl}
            alt={line.title}
            fill
            sizes="80px"
            className="object-contain p-1"
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <Link href={`/p/${line.slug}`} className="text-sm font-medium hover:underline">
          {line.title}
        </Link>
        {label && <p className="text-xs text-muted-foreground">{label}</p>}
        <p className="text-sm">{formatGHS(line.unitPrice)}</p>
        {line.stale && <p className="text-xs text-accent">Price updated since you added this.</p>}
        {!line.isActive && <p className="text-xs text-destructive">No longer available.</p>}

        <div className="mt-1 flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border">
            <button
              type="button"
              className="px-2 py-1 disabled:opacity-40"
              onClick={() => change(qty - 1)}
              disabled={pending}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center text-sm">{qty}</span>
            <button
              type="button"
              className="px-2 py-1 disabled:opacity-40"
              onClick={() => change(qty + 1)}
              disabled={pending || qty >= line.available}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => change(0)}
            disabled={pending}
          >
            Remove
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="text-right text-sm font-medium">{formatGHS(line.lineTotal)}</div>
    </li>
  );
}
