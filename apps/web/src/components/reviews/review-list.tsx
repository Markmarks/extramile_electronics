import { BadgeCheck } from 'lucide-react';
import type { PublishedReview } from '@/lib/reviews/queries';
import { Stars } from './stars';

export function ReviewList({ reviews }: { reviews: PublishedReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="panel text-[15px] text-muted-foreground" data-testid="no-reviews">
        No reviews yet. Customers who bought this can review it once their order is delivered.
      </p>
    );
  }
  return (
    <ul className="grouped" data-testid="review-list">
      {reviews.map((r) => (
        <li key={r.id} className="space-y-1.5 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars rating={r.rating} />
            {r.title && <p className="text-[15px] font-semibold">{r.title}</p>}
          </div>
          {r.body && (
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
              {r.body}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {r.verified && (
              <span className="inline-flex items-center gap-1 font-medium text-[#248A3D]">
                <BadgeCheck className="size-3.5" aria-hidden /> Verified purchase
              </span>
            )}
            <time dateTime={r.createdAt}>
              {new Date(r.createdAt).toLocaleDateString('en-GH', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </time>
          </p>
        </li>
      ))}
    </ul>
  );
}
