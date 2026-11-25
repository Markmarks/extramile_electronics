const tones: Record<string, string> = {
  paid: 'bg-success/15 text-success',
  delivered: 'bg-success/15 text-success',
  dispatched: 'bg-primary/10 text-primary',
  packed: 'bg-primary/10 text-primary',
  pending: 'bg-warning/15 text-warning',
  unpaid: 'bg-warning/15 text-warning',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-destructive/10 text-destructive',
  refunded: 'bg-foreground/[0.06] text-muted-foreground',
  oversold: 'bg-destructive/10 text-destructive',
};

/** Small capsule for order / payment states. Unknown states fall back to neutral grey. */
export function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${
        tones[value] ?? 'bg-foreground/[0.06] text-muted-foreground'
      }`}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}
