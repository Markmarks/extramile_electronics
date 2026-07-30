'use client';

import { Button } from '@extramile/ui';
import Link from 'next/link';

export default function CheckoutError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Checkout hit a snag</h1>
      <p className="text-muted-foreground">
        Your cart is safe and you haven&apos;t been charged. Please try again.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Retry</Button>
        <Button asChild variant="outline">
          <Link href="/cart">Back to cart</Link>
        </Button>
      </div>
    </main>
  );
}
