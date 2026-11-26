import { CONDITION_LABELS, PRODUCT_CONDITIONS } from '@extramile/core';
import { X } from 'lucide-react';
import Link from 'next/link';
import type { Brand } from '@/lib/catalog/queries';
import { buildFacetHref, PRICE_BANDS, RAM_STEPS_GB, STORAGE_STEPS_GB } from '@/lib/catalog/url';

const CONDITIONS = PRODUCT_CONDITIONS.map((c) => [c, CONDITION_LABELS[c]] as const);

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`pressable inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-foreground text-background'
          : 'bg-secondary text-foreground/80 hover:bg-foreground/[0.08]'
      }`}
    >
      {children}
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Min/max in whole cedis; a plain GET form so it works without JavaScript. */
function PriceRange({
  pathname,
  current,
}: {
  pathname: string;
  current: Record<string, string | undefined>;
}) {
  const keep = Object.entries(current).filter(
    ([k, v]) => v && !['min_price', 'max_price', 'page'].includes(k),
  );
  const input =
    'h-9 w-full min-w-0 rounded-lg bg-secondary px-2.5 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30';
  return (
    <form action={pathname} method="get" className="flex w-full items-center gap-2">
      {keep.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        name="min_price"
        inputMode="numeric"
        pattern="\d*"
        placeholder="Min"
        aria-label="Minimum price in cedis"
        defaultValue={current.min_price ?? ''}
        className={input}
      />
      <span className="text-muted-foreground">–</span>
      <input
        name="max_price"
        inputMode="numeric"
        pattern="\d*"
        placeholder="Max"
        aria-label="Maximum price in cedis"
        defaultValue={current.max_price ?? ''}
        className={input}
      />
      <button type="submit" className="btn-tinted btn-sm shrink-0">
        Go
      </button>
    </form>
  );
}

export function Facets({
  pathname,
  current,
  brands,
  memory = true,
}: {
  pathname: string;
  current: Record<string, string | undefined>;
  brands: Brand[];
  /** Show the storage / RAM filters (phones, laptops, search). */
  memory?: boolean;
}) {
  const hasFilters = Boolean(
    current.brand ||
    current.condition ||
    current.in_stock ||
    current.min_price ||
    current.max_price ||
    current.storage ||
    current.ram,
  );
  const clearHref = current.q ? `${pathname}?q=${encodeURIComponent(current.q)}` : pathname;

  return (
    <aside className="space-y-5 self-start rounded-2xl bg-card p-5 md:sticky md:top-20">
      <div className="flex items-center justify-between">
        <p className="text-[17px] font-semibold">Filters</p>
        {hasFilters && (
          <Link
            href={clearHref}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary"
          >
            <X className="size-3.5" aria-hidden /> Clear
          </Link>
        )}
      </div>

      {brands.length > 0 && (
        <Group title="Brand">
          {brands.map((b) => {
            const active = current.brand === b.slug;
            return (
              <Chip
                key={b.id}
                active={active}
                href={buildFacetHref(pathname, current, { brand: active ? null : b.slug })}
              >
                {b.name}
              </Chip>
            );
          })}
        </Group>
      )}

      <Group title="Condition">
        {CONDITIONS.map(([value, label]) => {
          const active = current.condition === value;
          return (
            <Chip
              key={value}
              active={active}
              href={buildFacetHref(pathname, current, { condition: active ? null : value })}
            >
              {label}
            </Chip>
          );
        })}
      </Group>

      <Group title="Price">
        {PRICE_BANDS.map((b) => {
          const min = b.min === undefined ? null : String(b.min);
          const max = b.max === undefined ? null : String(b.max);
          const active = (current.min_price ?? null) === min && (current.max_price ?? null) === max;
          return (
            <Chip
              key={b.label}
              active={active}
              href={buildFacetHref(
                pathname,
                current,
                active ? { min_price: null, max_price: null } : { min_price: min, max_price: max },
              )}
            >
              {b.label}
            </Chip>
          );
        })}
        <PriceRange pathname={pathname} current={current} />
      </Group>

      {memory && (
        <>
          <Group title="Storage">
            {STORAGE_STEPS_GB.map((gb) => {
              const active = current.storage === String(gb);
              return (
                <Chip
                  key={gb}
                  active={active}
                  href={buildFacetHref(pathname, current, { storage: active ? null : String(gb) })}
                >
                  {gb >= 1024 ? `${gb / 1024} TB+` : `${gb} GB+`}
                </Chip>
              );
            })}
          </Group>
          <Group title="RAM">
            {RAM_STEPS_GB.map((gb) => {
              const active = current.ram === String(gb);
              return (
                <Chip
                  key={gb}
                  active={active}
                  href={buildFacetHref(pathname, current, { ram: active ? null : String(gb) })}
                >
                  {gb} GB+
                </Chip>
              );
            })}
          </Group>
        </>
      )}

      <Group title="Availability">
        <Chip
          active={current.in_stock === '1'}
          href={buildFacetHref(pathname, current, {
            in_stock: current.in_stock === '1' ? null : '1',
          })}
        >
          In stock only
        </Chip>
      </Group>
    </aside>
  );
}
