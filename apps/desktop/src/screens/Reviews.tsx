import { BadgeCheck, Eye, EyeOff, MessageSquare, Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, Notice, PageHeader, StatusBadge } from '../components/ui';
import { listReviews, setReviewPublished, type Review } from '../lib/reviews';

type Filter = 'pending' | 'published' | 'all';

/** Approve or hide customer reviews. Staff can't edit what a customer wrote. */
export function Reviews() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReviews(await listReviews(filter));
    setLoading(false);
  }, [filter]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(r: Review) {
    setMessage(null);
    try {
      await setReviewPublished(r.id, !r.is_published);
      setMessage({
        tone: 'ok',
        text: r.is_published
          ? 'Hidden from the shop. The product rating was updated.'
          : 'Published. It now shows on the product page and counts in its rating.',
      });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed.' });
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Reviews"
        subtitle="New reviews stay hidden until someone here publishes them"
        actions={
          <div className="inline-flex rounded-lg border bg-secondary/50 p-0.5">
            {(['pending', 'published', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                  filter === f ? 'bg-card shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {f === 'pending' ? 'Waiting' : f}
              </button>
            ))}
          </div>
        }
      />
      {message && (
        <div className="mb-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      <section className="card divide-y">
        {loading ? (
          <p className="px-4 py-8 text-center text-muted-foreground">Loading…</p>
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={filter === 'pending' ? 'Nothing waiting' : 'No reviews'}
            body="Customers can review products from orders that were delivered to them."
          />
        ) : (
          reviews.map((r) => (
            <article key={r.id} className="flex gap-4 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="flex" aria-label={`${r.rating} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`size-3.5 ${n <= r.rating ? 'fill-warning text-warning' : 'text-border'}`}
                        aria-hidden
                      />
                    ))}
                  </span>
                  <span className="font-medium">{r.product?.title ?? 'Deleted product'}</span>
                  <StatusBadge value={r.is_published ? 'published' : 'hidden'} />
                  {r.is_verified_purchase && (
                    <span className="flex items-center gap-1 text-[11px] text-success">
                      <BadgeCheck className="size-3.5" aria-hidden /> Verified purchase
                    </span>
                  )}
                </p>
                {r.title && <p className="font-medium">{r.title}</p>}
                {r.body && <p className="whitespace-pre-line text-muted-foreground">{r.body}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {r.author ?? 'Customer'} · {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  className={r.is_published ? 'btn-secondary' : 'btn-primary'}
                  onClick={() => void toggle(r)}
                >
                  {r.is_published ? (
                    <>
                      <EyeOff className="size-3.5" aria-hidden /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="size-3.5" aria-hidden /> Publish
                    </>
                  )}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
