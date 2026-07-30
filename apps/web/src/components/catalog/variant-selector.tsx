'use client';

import { formatGHS } from '@extramile/core';
import { Button } from '@extramile/ui';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { addToCartAction } from '@/lib/cart/actions';
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
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startAdd] = useTransition();

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
    setQty(1);
    setMessage(null);
    const next = new URLSearchParams(params.toString());
    next.set('variant', v.sku);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  if (!selected) {
    return <p className="text-muted-foreground">This product has no available variants.</p>;
  }
  const chosen = selected;

  function add() {
    setMessage(null);
    startAdd(async () => {
      const res = await addToCartAction(chosen.id, qty);
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      window.dispatchEvent(new Event('cart:changed'));
      setMessage(res.clamped ? `Added — only ${res.qty} available.` : 'Added to cart.');
      router.refresh();
    });
  }

  const onSale = chosen.compareAtPrice != null && chosen.compareAtPrice > chosen.price;

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
          <span className="text-2xl font-semibold">{formatGHS(chosen.price)}</span>
          {onSale && chosen.compareAtPrice != null && (
            <span className="text-muted-foreground line-through">
              {formatGHS(chosen.compareAtPrice)}
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
                    v.id === chosen.id ? 'border-primary bg-primary/10' : 'hover:border-primary/50'
                  } ${v.available <= 0 ? 'opacity-50' : ''}`}
                >
                  {variantLabel(v)}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm">
          {chosen.available > 0 ? (
            <span className="text-success">
              In stock{chosen.available < 5 ? ` — only ${chosen.available} left` : ''}
            </span>
          ) : (
            <span className="text-destructive">Out of stock</span>
          )}
        </p>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-md border">
            <button
              type="button"
              className="px-3 py-2 disabled:opacity-40"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={pending || qty <= 1}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center text-sm">{qty}</span>
            <button
              type="button"
              className="px-3 py-2 disabled:opacity-40"
              onClick={() => setQty((q) => Math.min(chosen.available, q + 1))}
              disabled={pending || qty >= chosen.available}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <Button type="button" size="lg" disabled={chosen.available <= 0 || pending} onClick={add}>
            {pending ? 'Adding…' : 'Add to cart'}
          </Button>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <p className="text-xs text-muted-foreground">
          SKU {chosen.sku}
          {product.warrantyMonths > 0 && ` · ${product.warrantyMonths}-month warranty`}
          {product.warrantyProvider ? ` (${product.warrantyProvider})` : ''}
        </p>
      </div>
    </div>
  );
}
