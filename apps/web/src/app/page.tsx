import { Button } from '@extramile/ui';
import Link from 'next/link';
import { ProductGrid } from '@/components/catalog/product-grid';
import { getCategoryTree, listProducts } from '@/lib/catalog/queries';

export const revalidate = 300;

export default async function HomePage() {
  // Degrade gracefully if the DB is unreachable at build/render time.
  const [categories, featured] = await Promise.all([
    getCategoryTree().catch(() => []),
    listProducts({ sort: 'rating', pageSize: 8 }).catch(() => ({
      items: [],
      page: 1,
      pageSize: 8,
      hasMore: false,
    })),
  ]);

  return (
    <main className="container space-y-16 py-12">
      {/* Hero */}
      <section className="space-y-5 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">Accra · Ghana</p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Genuine electronics, real warranties
        </h1>
        <p className="mx-auto max-w-prose text-balance text-muted-foreground">
          Phones, laptops, TVs and audio with true stock and warranty records. Pay by mobile money
          or card — no DMs, no guesswork.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/search">Search the catalogue</Link>
          </Button>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Shop by category</h2>
          <div className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.slug}`}
                className="rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.items.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Top rated</h2>
          <ProductGrid items={featured.items} />
        </section>
      )}
    </main>
  );
}
