import { Check } from 'lucide-react';
import { StatusPill } from '@/components/account/status-pill';
import { trackerProgress, trackerStops } from '@/lib/orders/tracker';

/**
 * The "mile line": the logo's extra stroke drawn as a road. Done stops are filled, the
 * current stop is a ringed dot, later stops are hairline (brand book §07).
 */
export function OrderTimeline({ status }: { status: string }) {
  const cancelled = status === 'cancelled' || status === 'refunded' || status === 'oversold';
  if (cancelled) {
    return (
      <div className="panel flex items-center gap-3">
        <StatusPill value={status} />
        <p className="text-[15px] text-muted-foreground">This order is no longer in progress.</p>
      </div>
    );
  }
  const stops = trackerStops(status);
  const progress = trackerProgress(stops);
  const n = stops.length;
  return (
    <div className="panel">
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {/* Track runs between the first and last dot centres. */}
        <span
          className="absolute top-[7px] h-0.5 bg-border"
          style={{ left: `${50 / n}%`, right: `${50 / n}%` }}
          aria-hidden
        />
        <span
          className="absolute top-[7px] h-0.5 bg-primary transition-[width] duration-500"
          style={{ left: `${50 / n}%`, width: `${progress * (100 - 100 / n)}%` }}
          aria-hidden
        />
        {stops.map((stop) => (
          <li
            key={stop.status}
            aria-current={stop.state === 'current' ? 'step' : undefined}
            className="relative flex flex-col items-center gap-2 text-center"
          >
            <span
              className={`flex size-4 items-center justify-center rounded-full ${
                stop.state === 'done'
                  ? 'bg-primary text-primary-foreground'
                  : stop.state === 'current'
                    ? 'bg-card shadow-[inset_0_0_0_3px_hsl(var(--primary)),0_0_0_4px_hsl(var(--primary)/0.2)]'
                    : 'bg-card shadow-[inset_0_0_0_2px_hsl(var(--border))]'
              }`}
            >
              {stop.state === 'done' ? (
                <Check className="size-2.5" strokeWidth={4} aria-hidden />
              ) : null}
            </span>
            <span
              className={`text-[12px] font-semibold ${stop.state === 'todo' ? 'text-muted-foreground' : ''}`}
            >
              {stop.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
