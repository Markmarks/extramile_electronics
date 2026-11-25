import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Title row at the top of every screen, with optional actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const tones: Record<string, string> = {
  paid: 'bg-success/10 text-success',
  delivered: 'bg-success/10 text-success',
  confirmed: 'bg-primary/10 text-primary',
  packed: 'bg-primary/10 text-primary',
  dispatched: 'bg-sky-500/10 text-sky-600',
  pending: 'bg-warning/15 text-warning',
  unpaid: 'bg-warning/15 text-warning',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-destructive/10 text-destructive',
  oversold: 'bg-destructive/10 text-destructive',
  refunded: 'bg-secondary text-muted-foreground',
  admin: 'bg-primary/10 text-primary',
  staff: 'bg-primary/10 text-primary',
  customer: 'bg-secondary text-muted-foreground',
  active: 'bg-success/10 text-success',
  revoked: 'bg-destructive/10 text-destructive',
  off: 'bg-secondary text-muted-foreground',
  scheduled: 'bg-sky-500/10 text-sky-600',
  ended: 'bg-secondary text-muted-foreground',
  'used up': 'bg-warning/15 text-warning',
  published: 'bg-success/10 text-success',
  hidden: 'bg-secondary text-muted-foreground',
};

/** Order / payment / role state as a small coloured label; unknown values fall back to grey. */
export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`badge ${tones[value] ?? 'bg-secondary text-muted-foreground'}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'text-muted-foreground',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className={`size-4 ${tone}`} aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-xs text-muted-foreground">{body}</p>}
    </div>
  );
}

/** Inline result message under an action (success or error). */
export function Notice({ tone, children }: { tone: 'ok' | 'error' | 'info'; children: ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-success/10 text-success'
      : tone === 'error'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-secondary text-muted-foreground';
  return <p className={`rounded-lg px-3 py-2 text-[13px] ${cls}`}>{children}</p>;
}
