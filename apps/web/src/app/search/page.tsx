import type { Metadata } from 'next';
import Link from 'next/link';
import { Facets } from '@/components/catalog/facets';
import { ProductGrid } from '@/components/catalog/product-grid';
import { SortSelect } from '@/components/catalog/sort-select';
import { getActiveBrands, listProducts, type Condition } from '@/lib/catalog/queries';
import { buildPageHref, flattenParams, parseSort, type RawSearchParams } from '@/lib/catalog/url';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = flattenParams(await searchParams);
  const q = (sp.q ?? '').trim();
  const brands = await getActiveBrands();
  const brandId = sp.brand ? brands.find((b) => b.slug === sp.brand)?.id : undefined;
  const sort = parseSort(sp.sort);
  const page = Number.parseInt(sp.page ?? '1', 10) || 1;
  const pathname = '/search';

  const result = q
    ? await listProducts({
        q,
        brandId,
        condition: sp.condition as Condition | undefined,
        inStock: sp.in_stock === '1',
        sort,
        page,
      })
    : { items: [], page: 1, pageSize: 24, hasMore: false };

  return (
    <main className="container py-8">
      <form action="/search" method="get" className="mx-auto mb-8 flex max-w-xl gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search phones, laptops, TVs…"
          aria-label="Search products"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      {!q ? (
        <p className="py-16 text-center text-muted-foreground">
          Type a product name, brand, or model to search.
        </p>
      ) : (
        <div className="grid gap-8 md:grid-cols-[220px_1fr]">
          <Facets pathname={pathname} current={sp} brands={brands} />
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-medium">
                Results for <span className="font-semibold">“{q}”</span>
              </h1>
              <SortSelect value={sort} />
            </div>
            <ProductGrid items={result.items} />
            <div className="flex items-center justify-between pt-4">
              {page > 1 ? (
                <Link
                  className="text-sm text-primary hover:underline"
                  href={buildPageHref(pathname, sp, page - 1)}
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              {result.hasMore && (
                <Link
                  className="text-sm text-primary hover:underline"
                  href={buildPageHref(pathname, sp, page + 1)}
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
