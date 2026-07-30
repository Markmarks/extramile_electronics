'use client';

import { Button } from '@extramile/ui';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-prose text-muted-foreground">
        Please try again. If it keeps happening, contact support with the time this occurred.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
