import { formatGHS } from '@extramile/core';
import { Button } from '@extramile/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CartLineItem } from '@/components/cart/cart-line-item';
import { getCart } from '@/lib/cart/cart';

export const metadata: Metadata = { title: 'Your cart' };
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const cart = await getCart();

  if (cart.lines.length === 0) {
    return (
      <main className="container max-w-2xl space-y-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Your cart is empty</h1>
        <p className="text-muted-foreground">Find a phone, laptop or TV to get started.</p>
        <Button asChild>
          <Link href="/search">Browse the catalogue</Link>
        </Button>
      </main>
    );
  }

  const hasStale = cart.lines.some((l) => l.stale);

  return (
    <main className="container max-w-3xl space-y-6 py-10">
      <h1 className="text-2xl font-semibold">Your cart</h1>

      {hasStale && (
        <p className="rounded-md bg-accent/10 p-3 text-sm text-accent-foreground">
          Some prices changed since you added them. The totals below are current.
        </p>
      )}

      <ul className="divide-y border-y">
        {cart.lines.map((line) => (
          <CartLineItem key={line.variantId} line={line} />
        ))}
      </ul>

      <div className="ml-auto max-w-xs space-y-2">
        {cart.savings > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>You save</span>
            <span>{formatGHS(cart.savings)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Subtotal</span>
          <span>{formatGHS(cart.subtotal)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Shipping and any discount are calculated at checkout.
        </p>
        <Button asChild className="w-full" size="lg">
          <Link href="/checkout">Continue to checkout</Link>
        </Button>
      </div>
    </main>
  );
}
