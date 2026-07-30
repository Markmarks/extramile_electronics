import Image from 'next/image';
import Link from 'next/link';
import type { ProductListItem } from '@/lib/catalog/queries';
import { Price } from './price';

export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/p/${product.slug}`}
      className="group block rounded-lg border p-3 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt ?? product.title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-contain p-2 transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {!product.inStock && (
          <span className="absolute left-2 top-2 rounded bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
            Out of stock
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1">
        {product.brand && <p className="text-xs text-muted-foreground">{product.brand.name}</p>}
        <h3 className="line-clamp-2 text-sm font-medium">{product.title}</h3>
        <Price amount={product.minPrice} compareAt={product.compareAtPrice} />
      </div>
    </Link>
  );
}
