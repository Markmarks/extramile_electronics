import Link from 'next/link';
import type { Brand, Condition } from '@/lib/catalog/queries';
import { buildFacetHref } from '@/lib/catalog/url';

const CONDITIONS: [Condition, string][] = [
  ['new', 'New'],
  ['open_box', 'Open box'],
  ['refurbished', 'Refurbished'],
];

function FilterLink({
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
      className={`block rounded-md px-2 py-1 text-sm transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/10'
      }`}
    >
      {children}
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function Facets({
  pathname,
  current,
  brands,
}: {
  pathname: string;
  current: Record<string, string | undefined>;
  brands: Brand[];
}) {
  const hasFilters = Boolean(current.brand || current.condition || current.in_stock);

  return (
    <aside className="space-y-6">
      <Group title="Brand">
        {brands.map((b) => {
          const active = current.brand === b.slug;
          return (
            <FilterLink
              key={b.id}
              active={active}
              href={buildFacetHref(pathname, current, { brand: active ? null : b.slug })}
            >
              {b.name}
            </FilterLink>
          );
        })}
      </Group>

      <Group title="Condition">
        {CONDITIONS.map(([value, label]) => {
          const active = current.condition === value;
          return (
            <FilterLink
              key={value}
              active={active}
              href={buildFacetHref(pathname, current, { condition: active ? null : value })}
            >
              {label}
            </FilterLink>
          );
        })}
      </Group>

      <Group title="Availability">
        <FilterLink
          active={current.in_stock === '1'}
          href={buildFacetHref(pathname, current, {
            in_stock: current.in_stock === '1' ? null : '1',
          })}
        >
          In stock only
        </FilterLink>
      </Group>

      {hasFilters && (
        <Link href={pathname} className="inline-block text-sm text-primary hover:underline">
          Clear all filters
        </Link>
      )}
    </aside>
  );
}
