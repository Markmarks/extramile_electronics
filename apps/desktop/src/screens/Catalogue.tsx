import { CONDITION_LABELS, CONDITION_NOTES, formatGHS } from '@extramile/core';
import { Eye, EyeOff, ImagePlus, Package, Plus, Search, Tags, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { cleanSpecs, SpecsEditor } from '../components/SpecsEditor';
import { EmptyState, Notice, PageHeader } from '../components/ui';
import {
  CONDITIONS,
  createBrand,
  createCategory,
  createProduct,
  createVariant,
  deleteProductImage,
  imageUrl,
  listBrands,
  listCategories,
  listProducts,
  setProductActive,
  setProductCondition,
  updateProductSpecs,
  updateVariant,
  uploadProductImage,
  type Brand,
  type Category,
  type Condition,
  type ProductRow,
  type Specs,
} from '../lib/catalogue';

type StatusFilter = 'all' | 'published' | 'draft';

export function Catalogue() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dialog, setDialog] = useState<'product' | 'taxonomy' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const [c, b, p] = await Promise.all([listCategories(), listBrands(), listProducts()]);
    setCategories(c);
    setBrands(b);
    setProducts(p);
    setLoading(false);
    setSelectedId((id) => id ?? p[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const report =
    (fn: () => Promise<void>, ok = 'Saved.') =>
    async () => {
      setMessage(null);
      try {
        await fn();
        await refresh();
        setMessage({ tone: 'ok', text: ok });
      } catch (err) {
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed.' });
      }
    };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (status === 'all' || (status === 'published') === p.is_active) &&
        (!q ||
          p.title.toLowerCase().includes(q) ||
          (p.brand ?? '').toLowerCase().includes(q) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(q))),
    );
  }, [products, query, status]);

  const selected = products.find((p) => p.id === selectedId) ?? null;
  const published = products.filter((p) => p.is_active).length;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <PageHeader
        title="Catalogue"
        subtitle={`${products.length} products · ${published} published · ${products.length - published} drafts`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDialog('taxonomy')}>
              <Tags className="size-3.5" aria-hidden /> Categories & brands
            </button>
            <button type="button" className="btn-primary" onClick={() => setDialog('product')}>
              <Plus className="size-3.5" aria-hidden /> New product
            </button>
          </>
        }
      />
      {message && (
        <div className="mb-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[22rem_1fr]">
        {/* Product list */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          <div className="space-y-2 border-b p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                className="input pl-8"
                placeholder="Search title, brand or SKU"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'published', 'draft'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                    status === s
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {loading ? (
              <li className="px-4 py-8 text-center text-muted-foreground">Loading…</li>
            ) : shown.length === 0 ? (
              <li>
                <EmptyState
                  icon={Package}
                  title={products.length ? 'No matches' : 'No products yet'}
                  body={products.length ? undefined : 'Create your first product to get started.'}
                />
              </li>
            ) : (
              shown.map((p) => {
                const active = p.id === selectedId;
                const thumb = p.images[0];
                const stock = p.variants.reduce((n, v) => n + v.stock, 0);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent hover:bg-secondary/50'
                      }`}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary/50">
                        {thumb ? (
                          <img
                            src={imageUrl(thumb.storage_path)}
                            alt=""
                            className="size-full object-contain p-0.5"
                          />
                        ) : (
                          <Package className="size-4 text-muted-foreground" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{p.title}</span>
                          {p.condition !== 'new' && (
                            <span className="badge shrink-0 bg-amber-500/15 text-amber-700">
                              {CONDITION_LABELS[p.condition]}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {p.brand ?? 'No brand'} · {p.variants.length} variant
                          {p.variants.length === 1 ? '' : 's'} · {stock} in stock
                        </span>
                      </span>
                      <span
                        className={`size-2 shrink-0 rounded-full ${p.is_active ? 'bg-success' : 'bg-border'}`}
                        title={p.is_active ? 'Published' : 'Draft'}
                      />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* Editor */}
        <section className="card min-h-0 overflow-y-auto">
          {!selected ? (
            <EmptyState
              icon={Package}
              title="No product selected"
              body="Choose a product to edit its images, prices and stock."
            />
          ) : (
            <ProductEditor
              key={selected.id}
              product={selected}
              schema={categories.find((c) => c.id === selected.category_id)?.spec_schema ?? {}}
              onSaveSpecs={(specs) =>
                report(() => updateProductSpecs(selected.id, specs), 'Tech specs saved.')()
              }
              onToggleActive={() =>
                report(
                  () => setProductActive(selected.id, !selected.is_active),
                  selected.is_active ? 'Unpublished.' : 'Published to the storefront.',
                )()
              }
              onSetCondition={(c) =>
                report(
                  () => setProductCondition(selected.id, c),
                  `Condition set to ${CONDITION_LABELS[c]}.`,
                )()
              }
              onAddVariant={(sku, price, stock) =>
                report(() => createVariant(selected.id, sku, price, stock), 'Variant added.')()
              }
              onSaveVariant={(id, price, stock) => {
                // The count shown when the editor opened; the server applies the difference.
                const previous = selected.variants.find((v) => v.id === id)?.stock ?? stock;
                void report(
                  () => updateVariant(id, { priceCedis: price, stock: { previous, next: stock } }),
                  'Variant saved.',
                )();
              }}
              onToggleVariant={(id, active) =>
                report(() => updateVariant(id, { is_active: active }))()
              }
              onUploadImage={(file) =>
                report(() => uploadProductImage(selected.id, file), 'Image uploaded.')()
              }
              onDeleteImage={(id, path) =>
                report(() => deleteProductImage(id, path), 'Image removed.')()
              }
            />
          )}
        </section>
      </div>

      {dialog === 'product' && (
        <Dialog title="New product" onClose={() => setDialog(null)}>
          <NewProductForm
            categories={categories}
            brands={brands}
            onCreate={(p, v) => {
              setDialog(null);
              void report(async () => {
                const id = await createProduct(p);
                if (v) await createVariant(id, v.sku, v.priceCedis, v.stock);
                setSelectedId(id);
              }, 'Product created.')();
            }}
          />
        </Dialog>
      )}
      {dialog === 'taxonomy' && (
        <Dialog title="Categories & brands" onClose={() => setDialog(null)}>
          <Taxonomy
            categories={categories}
            brands={brands}
            onAddCategory={(n) => report(() => createCategory(n), 'Category added.')()}
            onAddBrand={(n) => report(() => createBrand(n), 'Brand added.')()}
          />
        </Dialog>
      )}
    </div>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h2 className="card-title">{title}</h2>
          <button
            type="button"
            className="btn-ghost h-7 w-7 px-0"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function Taxonomy({
  categories,
  brands,
  onAddCategory,
  onAddBrand,
}: {
  categories: Category[];
  brands: Brand[];
  onAddCategory: (name: string) => void;
  onAddBrand: (name: string) => void;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TaxonomyList title="Categories" items={categories} onAdd={onAddCategory} />
      <TaxonomyList title="Brands" items={brands} onAdd={onAddBrand} />
    </div>
  );
}

function TaxonomyList({
  title,
  items,
  onAdd,
}: {
  title: string;
  items: { id: string; name: string }[];
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="space-y-2">
      <p className="label">
        {title} ({items.length})
      </p>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onAdd(name.trim());
          setName('');
        }}
      >
        <input
          className="input"
          placeholder={`New ${title.toLowerCase().replace(/s$/, '')}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-secondary" disabled={!name.trim()}>
          Add
        </button>
      </form>
      <div className="flex flex-wrap gap-1">
        {items.map((i) => (
          <span key={i.id} className="badge bg-secondary font-medium normal-case text-foreground">
            {i.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function NewProductForm({
  categories,
  brands,
  onCreate,
}: {
  categories: Category[];
  brands: Brand[];
  onCreate: (
    p: {
      title: string;
      categoryId: string;
      brandId: string;
      description: string;
      condition: Condition;
      warrantyMonths: number;
      isActive: boolean;
      specs: Specs;
    },
    variant: { sku: string; priceCedis: number; stock: number } | null,
  ) => void;
}) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<Condition>('new');
  const [warranty, setWarranty] = useState(12);
  const [isActive, setIsActive] = useState(false);
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [specs, setSpecs] = useState<Specs>({});
  const schema = categories.find((c) => c.id === categoryId)?.spec_schema ?? {};

  const ready = title.trim() && categoryId && brandId;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const priceNum = Number(price);
    const variant =
      sku.trim() && priceNum > 0
        ? { sku: sku.trim(), priceCedis: priceNum, stock: Number(stock) || 0 }
        : null;
    onCreate(
      {
        title: title.trim(),
        categoryId,
        brandId,
        description: description.trim(),
        condition,
        warrantyMonths: warranty,
        isActive,
        specs: cleanSpecs(specs),
      },
      variant,
    );
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <label className="block">
        <span className="label">Title</span>
        <input
          className="input"
          placeholder="e.g. iPhone 15 Pro"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Category</span>
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Brand</span>
          <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Choose…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Description</span>
        <textarea
          className="input"
          rows={3}
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Condition</span>
          <select
            className="input"
            value={condition}
            onChange={(e) => setCondition(e.target.value as Condition)}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Warranty (months)</span>
          <input
            className="input"
            type="number"
            min={0}
            value={warranty}
            onChange={(e) => setWarranty(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <fieldset className="rounded-lg border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Tech specs</legend>
        {categoryId ? (
          <SpecsEditor schema={schema} value={specs} onChange={setSpecs} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Choose a category to fill in its usual specs. You can also add your own.
          </p>
        )}
      </fieldset>

      <fieldset className="rounded-lg border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          First variant (optional)
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <input
            className="input"
            placeholder="SKU"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            placeholder="Price GH₵"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Stock"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-muted-foreground">
        <input
          type="checkbox"
          className="accent-[hsl(var(--primary))]"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Publish immediately (visible on the storefront)
      </label>
      <div className="flex justify-end border-t pt-3">
        <button className="btn-primary" disabled={!ready}>
          Create product
        </button>
      </div>
    </form>
  );
}

function ProductEditor({
  product,
  schema,
  onSaveSpecs,
  onToggleActive,
  onSetCondition,
  onAddVariant,
  onSaveVariant,
  onToggleVariant,
  onUploadImage,
  onDeleteImage,
}: {
  product: ProductRow;
  schema: Record<string, unknown>;
  onSaveSpecs: (specs: Specs) => void;
  onToggleActive: () => void;
  onSetCondition: (condition: Condition) => void;
  onAddVariant: (sku: string, priceCedis: number, stock: number) => void;
  onSaveVariant: (id: string, priceCedis: number, stock: number) => void;
  onToggleVariant: (id: string, active: boolean) => void;
  onUploadImage: (file: File) => void;
  onDeleteImage: (id: string, storagePath: string) => void;
}) {
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [specs, setSpecs] = useState<Specs>(product.specs);
  const specsDirty =
    JSON.stringify(cleanSpecs(specs)) !== JSON.stringify(cleanSpecs(product.specs));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <p className="text-lg font-semibold">{product.title}</p>
          <p className="mt-0.5 text-muted-foreground">
            {product.category ?? 'No category'} · {product.brand ?? 'No brand'}
          </p>
        </div>
        <button
          type="button"
          className={product.is_active ? 'btn-secondary' : 'btn-primary'}
          onClick={onToggleActive}
        >
          {product.is_active ? (
            <>
              <EyeOff className="size-3.5" aria-hidden /> Unpublish
            </>
          ) : (
            <>
              <Eye className="size-3.5" aria-hidden /> Publish
            </>
          )}
        </button>
      </div>

      <div className="border-b p-5">
        <p className="card-title mb-2">Condition</p>
        <div className="inline-flex rounded-lg border bg-secondary/50 p-0.5" role="radiogroup">
          {CONDITIONS.map((c) => {
            const active = product.condition === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => !active && onSetCondition(c)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {CONDITION_LABELS[c]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Customers see: “{CONDITION_LABELS[product.condition]}” —{' '}
          {CONDITION_NOTES[product.condition]}
        </p>
      </div>

      <div className="border-b p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="card-title">Images</p>
          <p className="text-[11px] text-muted-foreground">PNG, JPEG, WebP or AVIF · max 2 MB</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.images.map((img) => (
            <div
              key={img.id}
              className="group relative size-24 overflow-hidden rounded-lg border bg-secondary/40"
            >
              <img
                src={imageUrl(img.storage_path)}
                alt=""
                className="size-full object-contain p-1"
              />
              <button
                type="button"
                title="Remove image"
                onClick={() => onDeleteImage(img.id, img.storage_path)}
                className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded-md bg-card/90 text-destructive shadow-sm group-hover:flex"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          <label
            className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            title="Add image (max 2 MB)"
          >
            <ImagePlus className="size-5" aria-hidden />
            Add image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadImage(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="border-b p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="card-title">Tech specs</p>
            <p className="text-[11px] text-muted-foreground">
              Shown on the product page under “Tech specs”.
            </p>
          </div>
          <div className="flex gap-1.5">
            {specsDirty && (
              <button type="button" className="btn-ghost" onClick={() => setSpecs(product.specs)}>
                Discard
              </button>
            )}
            <button
              type="button"
              className={specsDirty ? 'btn-primary' : 'btn-secondary'}
              disabled={!specsDirty}
              onClick={() => onSaveSpecs(cleanSpecs(specs))}
            >
              Save specs
            </button>
          </div>
        </div>
        <SpecsEditor schema={schema} value={specs} onChange={setSpecs} />
      </div>

      <div className="p-5">
        <p className="card-title mb-2">Variants</p>
        <div className="overflow-hidden rounded-lg border">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th className="w-28">Price GH₵</th>
                <th className="w-24">Stock</th>
                <th className="w-40 text-right" />
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <VariantRow
                  key={v.id}
                  sku={v.sku}
                  price={v.price}
                  stock={v.stock}
                  active={v.is_active}
                  onSave={(p, s) => onSaveVariant(v.id, p, s)}
                  onToggle={() => onToggleVariant(v.id, !v.is_active)}
                />
              ))}
              <tr className="bg-secondary/30 hover:bg-secondary/30">
                <td>
                  <input
                    className="input"
                    placeholder="New SKU"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!sku.trim() || !(Number(price) > 0)}
                    onClick={() => {
                      onAddVariant(sku.trim(), Number(price), Number(stock) || 0);
                      setSku('');
                      setPrice('');
                      setStock('0');
                    }}
                  >
                    <Plus className="size-3.5" aria-hidden /> Add variant
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function VariantRow({
  sku,
  price,
  stock,
  active,
  onSave,
  onToggle,
}: {
  sku: string;
  price: number;
  stock: number;
  active: boolean;
  onSave: (priceCedis: number, stock: number) => void;
  onToggle: () => void;
}) {
  const [p, setP] = useState((price / 100).toFixed(2));
  const [s, setS] = useState(String(stock));
  const dirty = p !== (price / 100).toFixed(2) || s !== String(stock);

  return (
    <tr className={active ? '' : 'opacity-60'}>
      <td>
        <p className="font-mono text-xs">{sku}</p>
        <p className="text-[11px] text-muted-foreground">Now {formatGHS(price)}</p>
      </td>
      <td>
        <input
          className="input"
          type="number"
          min={0}
          step="0.01"
          value={p}
          onChange={(e) => setP(e.target.value)}
        />
      </td>
      <td>
        <input
          className="input"
          type="number"
          min={0}
          value={s}
          onChange={(e) => setS(e.target.value)}
        />
      </td>
      <td>
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            className={dirty ? 'btn-primary' : 'btn-secondary'}
            onClick={() => onSave(Number(p), Number(s) || 0)}
            disabled={!dirty || !(Number(p) > 0)}
          >
            Save
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onToggle}
            title={active ? 'Hide this variant' : 'Show this variant'}
          >
            {active ? 'Active' : 'Hidden'}
          </button>
        </div>
      </td>
    </tr>
  );
}
