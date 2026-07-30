import { pesewasToCedis } from '@extramile/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ProductCard } from '@/components/catalog/product-card';
import { SpecTable } from '@/components/catalog/spec-table';
import { VariantSelector } from '@/components/catalog/variant-selector';
import { getProductBySlug, getRelatedProducts } from '@/lib/catalog/queries';
import { createPublicClient } from '@/lib/supabase/public';

export const revalidate = 300;

/** Prerender active product pages at build; unknown slugs still render on-demand. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('products')
      .select('slug')
      .eq('is_active', true)
      .returns<{ slug: string }[]>();
    return (data ?? []).map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: 'Not found' };
  const image = product.images.find((i) => i.url)?.url ?? undefined;
  return {
    title: product.title,
    description: product.description ?? `${product.title} — genuine, warrantied, in Accra.`,
    openGraph: { title: product.title, images: image ? [image] : [] },
    alternates: { canonical: `/p/${product.slug}` },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = product.category ? await getRelatedProducts(product.category.id, product.id) : [];

  const prices = product.variants.map((v) => v.price);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  const anyInStock = product.variants.some((v) => v.available > 0);
  const image = product.images.find((i) => i.url)?.url;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? undefined,
    sku: product.variants[0]?.sku,
    image: image ? [image] : undefined,
    brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'GHS',
      lowPrice: pesewasToCedis(low),
      highPrice: pesewasToCedis(high),
      offerCount: product.variants.length,
      availability: anyInStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      ...(product.category
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: product.category.name,
              item: `/c/${product.category.slug}`,
            },
          ]
        : []),
      { '@type': 'ListItem', position: product.category ? 3 : 2, name: product.title },
    ],
  };

  return (
    <main className="container py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Home
        </Link>{' '}
        /{' '}
        {product.category && (
          <>
            <Link href={`/c/${product.category.slug}`} className="hover:underline">
              {product.category.name}
            </Link>{' '}
            /{' '}
          </>
        )}
        <span className="text-foreground">{product.title}</span>
      </nav>

      <div className="space-y-4">
        {product.brand && <p className="text-sm text-muted-foreground">{product.brand.name}</p>}
        <h1 className="text-3xl font-bold tracking-tight">{product.title}</h1>
      </div>

      <div className="mt-8">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" />}>
          <VariantSelector product={product} />
        </Suspense>
      </div>

      {product.description && (
        <section className="mt-12 max-w-prose">
          <h2 className="mb-3 text-xl font-semibold">Overview</h2>
          <p className="whitespace-pre-line text-muted-foreground">{product.description}</p>
        </section>
      )}

      <section className="mt-12 max-w-2xl">
        <h2 className="mb-3 text-xl font-semibold">Specifications</h2>
        <SpecTable specs={product.specs} schema={product.category?.specSchema ?? {}} />
      </section>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-4 text-xl font-semibold">Related products</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
