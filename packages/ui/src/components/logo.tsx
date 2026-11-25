import * as React from 'react';
import { cn } from '../lib/cn';

/*
 * The ExtraMile mark: an E in a rounded tile whose middle stroke runs past the tile's edge
 * ("the extra mile"). Geometry follows docs/brand/extramile-brand-book.html §04: 48-unit tile,
 * 12-unit radius, 6.5-unit strokes, middle stroke 52 units (16 outside the tile).
 * Colours come from tokens.css so the tile lifts off Onyx at night.
 */

type MarkProps = React.SVGProps<SVGSVGElement> & {
  /** Accessible name. Omit when the mark sits next to visible "extramile" text. */
  title?: string;
};

/** The mark alone, 4:3. Size it with a height class, e.g. `h-7 w-auto`. */
export function LogoMark({ title, className, ...props }: MarkProps) {
  const titleId = React.useId();
  return (
    <svg
      viewBox="0 0 64 48"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      className={cn('h-7 w-auto shrink-0', className)}
      {...props}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <rect width="48" height="48" rx="12" fill="hsl(var(--logo-tile))" />
      <g fill="hsl(var(--logo-fg))">
        <rect x="12" y="11" width="6.5" height="26" rx="1.5" />
        <rect x="12" y="11" width="23" height="6.5" rx="1.5" />
        <rect x="12" y="30.5" width="23" height="6.5" rx="1.5" />
      </g>
      <rect x="12" y="20.75" width="52" height="6.5" rx="3.25" fill="hsl(var(--brand-stroke))" />
    </svg>
  );
}

type LogoProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** Show the small "Electronics" / "Back-office" line under the wordmark. */
  descriptor?: string;
  /** Classes for the mark (its height drives the lockup size). */
  markClassName?: string;
};

/** Primary lockup: mark + lowercase "extramile" wordmark in the display face. */
export function Logo({ descriptor, markClassName, className, ...props }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} {...props}>
      <LogoMark className={markClassName} />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.25em] font-extrabold tracking-[-0.055em] text-foreground">
          extramile
        </span>
        {descriptor ? (
          <span className="mt-1 text-[0.55em] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {descriptor}
          </span>
        ) : null}
      </span>
    </span>
  );
}
