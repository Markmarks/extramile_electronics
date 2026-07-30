import { Button } from '@extramile/ui';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container flex min-h-dvh flex-col items-center justify-center gap-8 py-16 text-center">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">Accra · Ghana</p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          ExtraMile Electronics
        </h1>
        <p className="mx-auto max-w-prose text-balance text-muted-foreground">
          Genuine phones, laptops, TVs and audio — real stock, real warranties, pay by mobile money
          or card. No DMs, no guesswork.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/search">Browse the catalogue</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/account/orders">Track an order</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Foundation scaffold — storefront lands in phase P4.
      </p>
    </main>
  );
}
