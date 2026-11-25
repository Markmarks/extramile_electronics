'use client';

import { Star } from 'lucide-react';
import Link from 'next/link';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { reviewEligibilityAction, submitReviewAction } from '@/lib/reviews/actions';
import {
  REVIEW_BODY_MAX,
  REVIEW_TITLE_MAX,
  type ReviewEligibility,
  type ReviewFormState,
} from '@/lib/reviews/schema';

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

function StarPicker({ error }: { error?: string }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="field-label">Your rating</legend>
      <div className="flex items-center gap-3">
        <div className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
              <input
                type="radio"
                name="rating"
                value={n}
                checked={value === n}
                onChange={() => setValue(n)}
                className="peer sr-only"
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              />
              <Star
                className={`size-7 rounded peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${
                  n <= shown
                    ? 'fill-warning text-warning'
                    : 'fill-foreground/[0.08] text-transparent'
                }`}
                aria-hidden
              />
            </label>
          ))}
        </div>
        <span className="text-[13px] text-muted-foreground" aria-live="polite">
          {RATING_WORDS[shown]}
        </span>
      </div>
      {error && <p className="mt-1 text-[13px] text-destructive">{error}</p>}
    </fieldset>
  );
}

function ReviewForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState<ReviewFormState, FormData>(
    submitReviewAction,
    { status: 'idle' },
  );

  if (state.status === 'submitted') {
    return (
      <p role="status" className="panel text-[15px]" data-testid="review-submitted">
        <span className="font-semibold">Thanks for your review!</span>{' '}
        <span className="text-muted-foreground">
          It will appear here once our team has approved it.
        </span>
      </p>
    );
  }

  const fe = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  return (
    <form
      // Not action={formAction}: React resets the fields after a form action, which would
      // wipe what the customer typed when validation fails.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="panel space-y-4"
      data-testid="review-form"
    >
      <input type="hidden" name="productId" value={productId} />
      <StarPicker error={fe.rating} />
      <div>
        <label htmlFor="review-title" className="field-label">
          Title
        </label>
        <input
          id="review-title"
          name="title"
          required
          minLength={2}
          maxLength={REVIEW_TITLE_MAX}
          className="field"
          placeholder="Sum it up in a few words"
        />
        {fe.title && <p className="mt-1 text-[13px] text-destructive">{fe.title}</p>}
      </div>
      <div>
        <label htmlFor="review-body" className="field-label">
          Review
        </label>
        <textarea
          id="review-body"
          name="body"
          required
          minLength={10}
          maxLength={REVIEW_BODY_MAX}
          rows={5}
          className="field h-auto py-2.5"
          placeholder="What did you like or dislike? How are you using it?"
        />
        {fe.body && <p className="mt-1 text-[13px] text-destructive">{fe.body}</p>}
      </div>
      {state.status === 'error' && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
        >
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Sending…' : 'Submit review'}
        </button>
        <p className="text-[13px] text-muted-foreground">
          Reviews are checked by our team before they appear.
        </p>
      </div>
    </form>
  );
}

/**
 * "Write a review" on the product page. The page itself is ISR-cached and cookie-free, so
 * whether this visitor may review is asked from the browser once the page has loaded.
 */
export function WriteReview({ productId, slug }: { productId: string; slug: string }) {
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    reviewEligibilityAction(productId)
      .then((e) => {
        if (!live) return;
        setEligibility(e);
        if (e.state === 'eligible' && window.location.hash === '#write-review') setOpen(true);
      })
      .catch(() => live && setEligibility(null));
    return () => {
      live = false;
    };
  }, [productId]);

  if (!eligibility) return null;

  switch (eligibility.state) {
    case 'signed-out':
      return (
        <p className="text-[15px] text-muted-foreground" data-testid="review-signin">
          Bought this from us?{' '}
          <Link
            href={`/login?next=${encodeURIComponent(`/p/${slug}#write-review`)}`}
            className="font-medium text-primary"
          >
            Sign in to write a review
          </Link>
        </p>
      );
    case 'not-purchased':
      return (
        <p className="text-[13px] text-muted-foreground">
          You can review this product once an order containing it has been delivered to you.
        </p>
      );
    case 'reviewed':
      return (
        <p className="text-[15px] text-muted-foreground" data-testid="review-pending">
          {eligibility.published
            ? 'Thanks — your review is published below.'
            : 'Thanks — your review is awaiting approval by our team.'}
        </p>
      );
    case 'eligible':
      return open ? (
        <ReviewForm productId={productId} />
      ) : (
        <button type="button" className="btn-tinted" onClick={() => setOpen(true)}>
          Write a review
        </button>
      );
  }
}
