import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Facets } from '@/components/catalog/facets';
import { ProductGrid } from '@/components/catalog/product-grid';
import { SortSelect } from '@/components/catalog/sort-select';
import {
  getActiveBrands,
  getCategoryBySlug,
  listProducts,
  type Condition,
} from '@/lib/catalog/queries';
import { buildPageHref, flattenParams, parseSort, type RawSearchParams } from '@/lib/catalog/url';

export const revalidate = 300;

function lastSlug(slug: string[]): string {
  return slug[slug.length - 1] ?? '';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(lastSlug(slug));
  if (!category) return { title: 'Not found' };
  return { title: category.name, description: `Shop ${category.name} at ExtraMile Electronics.` };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { slug } = await params;
  const sp = flattenParams(await searchParams);
  const category = await getCategoryBySlug(lastSlug(slug));
  if (!category) notFound();

  const brands = await getActiveBrands();
  const brandId = sp.brand ? brands.find((b) => b.slug === sp.brand)?.id : undefined;
  const sort = parseSort(sp.sort);
  const page = Number.parseInt(sp.page ?? '1', 10) || 1;
  const pathname = `/c/${slug.join('/')}`;

  const result = await listProducts({
    categoryId: category.id,
    brandId,
    condition: sp.condition as Condition | undefined,
    inStock: sp.in_stock === '1',
    sort,
    page,
  });

  return (
    <main className="container py-8">
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Home
        </Link>{' '}
        / <span className="text-foreground">{category.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <Facets pathname={pathname} current={sp} brands={brands} />

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">{category.name}</h1>
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
    </main>
  );
}
