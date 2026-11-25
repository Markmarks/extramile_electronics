import { Star } from 'lucide-react';

/** Read-only 1–5 star row. */
export function Stars({ rating, className = 'size-4' }: { rating: number; className?: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${className} ${
            n <= rating ? 'fill-warning text-warning' : 'fill-foreground/[0.08] text-transparent'
          }`}
          aria-hidden
        />
      ))}
    </span>
  );
}
