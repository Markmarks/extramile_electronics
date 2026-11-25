import { displaySpecValue, orderSpecKeys, specLabel } from '@extramile/core';

/**
 * Spec list: the category's spec_schema keys first (in SPEC_ORDER), then any extra
 * specs staff added for this product. Empty values are skipped.
 */
export function SpecTable({
  specs,
  schema,
}: {
  specs: Record<string, unknown>;
  schema: Record<string, unknown>;
}) {
  const ordered = orderSpecKeys(Object.keys(schema));
  const extras = orderSpecKeys(Object.keys(specs).filter((k) => !ordered.includes(k)));
  const keys = [...ordered, ...extras];
  const rows = keys.filter((k) => specs[k] !== undefined && specs[k] !== null && specs[k] !== '');
  if (rows.length === 0) return null;

  // Card list: label left, value right, hairlines inset from the leading edge.
  return (
    <dl className="overflow-hidden rounded-2xl bg-card text-[15px]">
      {rows.map((k, i) => (
        <div key={k} className="flex items-center justify-between gap-4 pl-4">
          <div
            className={`flex flex-1 items-center justify-between gap-4 py-3 pr-4 ${
              i > 0 ? 'border-t border-foreground/[0.06]' : ''
            }`}
          >
            <dt className="text-muted-foreground">{specLabel(k)}</dt>
            <dd className="text-right font-medium">{displaySpecValue(specs[k])}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
