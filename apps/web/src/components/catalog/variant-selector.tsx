'use client';

import { formatGHS } from '@extramile/core';
import { Button } from '@extramile/ui';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ProductDetail, VariantDetail } from '@/lib/catalog/queries';

function variantLabel(v: VariantDetail): string {
  const vals = Object.values(v.attrs)
    .filter((x) => x !== null && x !== undefined && x !== '')
    .map(String);
  return vals.length ? vals.join(' · ') : v.sku;
}

export function VariantSelector({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const initialSku = params.get('variant') ?? undefined;
  const initial = product.variants.find((v) => v.sku === initialSku) ?? product.variants[0];
  const [selectedId, setSelectedId] = useState(initial?.id);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  const selected = product.variants.find((v) => v.id === selectedId) ?? initial;

  const images = useMemo(() => {
    const isStr = (u: string | null): u is string => Boolean(u);
    const forVariant = product.images
      .filter((i) => i.variantId === selected?.id)
      .map((i) => i.url)
      .filter(isStr);
    const generic = product.images
      .filter((i) => !i.variantId)
      .map((i) => i.url)
      .filter(isStr);
    const all = product.images.map((i) => i.url).filter(isStr);
    return forVariant.length ? forVariant : generic.length ? generic : all;
  }, [product.images, selected?.id]);

  function select(v: VariantDetail) {
    setSelectedId(v.id);
    setActiveImage(0);
    setAdded(false);
    const next = new URLSearchParams(params.toString());
    next.set('variant', v.sku);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  if (!selected) {
    return <p className="text-muted-foreground">This product has no available variants.</p>;
  }

  const onSale = selected.compareAtPrice != null && selected.compareAtPrice > selected.price;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Gallery */}
      <div className="space-y-3">
        <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
          {images[activeImage] ? (
            <Image
              src={images[activeImage]}
              alt={product.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain p-4"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No image
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {images.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setActiveImage(i)}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border ${
                  i === activeImage ? 'ring-2 ring-ring' : ''
                }`}
                aria-label={`Image ${i + 1}`}
              >
                <Image src={url} alt="" fill sizes="64px" className="object-contain p-1" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selection */}
      <div className="space-y-5">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold">{formatGHS(selected.price)}</span>
          {onSale && selected.compareAtPrice != null && (
            <span className="text-muted-foreground line-through">
              {formatGHS(selected.compareAtPrice)}
            </span>
          )}
        </div>

        {product.variants.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Options</p>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => select(v)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    v.id === selected.id
                      ? 'border-primary bg-primary/10'
                      : 'hover:border-primary/50'
                  } ${v.available <= 0 ? 'opacity-50' : ''}`}
                >
                  {variantLabel(v)}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm">
          {selected.available > 0 ? (
            <span className="text-success">
              In stock{selected.available < 5 ? ` — only ${selected.available} left` : ''}
            </span>
          ) : (
            <span className="text-destructive">Out of stock</span>
          )}
        </p>

        <div className="space-y-2">
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            disabled={selected.available <= 0}
            onClick={() => setAdded(true)}
          >
            Add to cart
          </Button>
          {added && (
            <p className="text-sm text-muted-foreground">
              Cart is wired up in the next build step (P5).
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          SKU {selected.sku}
          {product.warrantyMonths > 0 && ` · ${product.warrantyMonths}-month warranty`}
          {product.warrantyProvider ? ` (${product.warrantyProvider})` : ''}
        </p>
      </div>
    </div>
  );
}
