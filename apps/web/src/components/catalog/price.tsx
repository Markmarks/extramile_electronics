import { formatGHS } from '@extramile/core';

export function Price({
  amount,
  compareAt,
  className,
}: {
  amount: number | null;
  compareAt?: number | null;
  className?: string;
}) {
  if (amount === null) {
    return <span className="text-sm text-muted-foreground">Unavailable</span>;
  }
  const onSale = compareAt != null && compareAt > amount;
  return (
    <span className={`flex flex-wrap items-baseline gap-2 ${className ?? ''}`}>
      <span className="font-display font-bold tabular-nums tracking-tight">
        {formatGHS(amount)}
      </span>
      {onSale && (
        <span className="text-sm text-muted-foreground line-through">{formatGHS(compareAt)}</span>
      )}
    </span>
  );
}
