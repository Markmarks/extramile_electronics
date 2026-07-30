import { Button } from '@extramile/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-muted-foreground">We couldn&apos;t find that page.</p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
