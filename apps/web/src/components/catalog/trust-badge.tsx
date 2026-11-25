import { ShieldCheck } from 'lucide-react';

/**
 * "Covered" pillar: the warranty on record for a product. Platinum chip per the brand book
 * (§07) — platinum is never text, so the label stays in the foreground colour.
 * Renders nothing when there's no warranty on record, so it never over-promises.
 */
export function WarrantyBadge({ months, className }: { months: number; className?: string }) {
  if (months <= 0) return null;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-md bg-platinum/60 px-1.5 py-0.5 text-[11px] font-semibold text-foreground dark:bg-platinum/15 ${className ?? ''}`}
    >
      <ShieldCheck className="size-3" aria-hidden />
      {months}-mo warranty
    </span>
  );
}
