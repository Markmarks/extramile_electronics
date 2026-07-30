import type { ProductListItem } from '@/lib/catalog/queries';
import { ProductCard } from './product-card';

export function ProductGrid({ items }: { items: ProductListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-muted-foreground">No products match your filters.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
