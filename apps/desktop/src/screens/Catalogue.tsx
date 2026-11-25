import { CONDITION_LABELS, CONDITION_NOTES, formatGHS, specKey, specLabel } from '@extramile/core';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ImagePlus,
  Package,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { cedisInputToPesewas, Field, Modal, pesewasToInput } from '../components/Modal';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { cleanSpecs, SpecsEditor } from '../components/SpecsEditor';
import { EmptyState, Notice, PageHeader } from '../components/ui';
import {
  CONDITIONS,
  createBrand,
  createCategory,
  createProduct,
  createVariant,
  deleteBrand,
  deleteCategory,
  deleteProductImage,
  imageUrl,
  listBrands,
  listCategories,
  listProducts,
  moveImage,
  renameBrand,
  setImageAlt,
  setProductActive,
  setProductCondition,
  updateCategory,
  updateProductDetails,
  updateProductSpecs,
  updateVariant,
  updateVariantDetails,
  uploadProductImage,
  type Brand,
  type Category,
  type CategoryPatch,
  type Condition,
  type ProductDetails,
  type ProductRow,
  type Specs,
  type VariantDetails,
  type VariantRow as Variant,
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
              categories={categories}
              brands={brands}
              onSaveDetails={(d) =>
                report(() => updateProductDetails(selected.id, d), 'Details saved.')()
              }
              onSaveVariantDetails={(id, d) =>
                report(() => updateVariantDetails(id, d), 'Variant details saved.')()
              }
              onMoveImage={(id, dir) =>
                report(() => moveImage(selected.images, id, dir), 'Image order saved.')()
              }
              onSetImageAlt={(id, alt) =>
                report(() => setImageAlt(id, alt), 'Image description saved.')()
              }
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
            onUpdateCategory={(id, p) => report(() => updateCategory(id, p), 'Category saved.')()}
            onDeleteCategory={(id) => report(() => deleteCategory(id), 'Category deleted.')()}
            onRenameBrand={(id, n) => report(() => renameBrand(id, n), 'Brand renamed.')()}
            onDeleteBrand={(id) => report(() => deleteBrand(id), 'Brand deleted.')()}
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
  onUpdateCategory,
  onDeleteCategory,
  onRenameBrand,
  onDeleteBrand,
}: {
  categories: Category[];
  brands: Brand[];
  onAddCategory: (name: string) => void;
  onAddBrand: (name: string) => void;
  onUpdateCategory: (id: string, patch: CategoryPatch) => void;
  onDeleteCategory: (id: string) => void;
  onRenameBrand: (id: string, name: string) => void;
  onDeleteBrand: (id: string) => void;
}) {
  const [tab, setTab] = useState<'categories' | 'brands'>('categories');
  const tabs = [
    ['categories', `Categories (${categories.length})`],
    ['brands', `Brands (${brands.length})`],
  ] as const;
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border bg-secondary/50 p-0.5">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === id ? 'bg-card shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'categories' ? (
        <>
          <AddRow placeholder="New category" onAdd={onAddCategory} />
          <ul className="divide-y rounded-lg border">
            {categories.map((c) => (
              <CategoryItem
                key={c.id}
                category={c}
                categories={categories}
                onSave={(p) => onUpdateCategory(c.id, p)}
                onDelete={() => onDeleteCategory(c.id)}
              />
            ))}
          </ul>
        </>
      ) : (
        <>
          <AddRow placeholder="New brand" onAdd={onAddBrand} />
          <ul className="divide-y rounded-lg border">
            {brands.map((b) => (
              <NameItem
                key={b.id}
                name={b.name}
                onRename={(n) => onRenameBrand(b.id, n)}
                onDelete={() => onDeleteBrand(b.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
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
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn-secondary" disabled={!name.trim()}>
        <Plus className="size-3.5" aria-hidden /> Add
      </button>
    </form>
  );
}

/** Inline rename + two-step delete for a brand. */
function NameItem({
  name,
  onRename,
  onDelete,
}: {
  name: string;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(name);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex items-center gap-1.5 p-2">
      <input
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Brand name"
      />
      <button
        type="button"
        className="btn-secondary"
        disabled={!value.trim() || value === name}
        onClick={() => onRename(value)}
      >
        Save
      </button>
      <button
        type="button"
        className={confirm ? 'btn-secondary text-destructive' : 'btn-ghost'}
        onClick={() => (confirm ? onDelete() : setConfirm(true))}
        title="Only possible when no product uses it"
        aria-label={`Delete ${name}`}
      >
        <Trash2 className="size-3.5" aria-hidden /> {confirm ? 'Delete?' : ''}
      </button>
    </li>
  );
}

type SpecFieldType = 'string' | 'number' | 'boolean';
interface SpecFieldRow {
  key: string;
  type: SpecFieldType;
  facet: boolean;
}

function specFieldList(schema: Record<string, unknown>): SpecFieldRow[] {
  return Object.entries(schema).map(([key, v]) => {
    const o = (v ?? {}) as { type?: unknown; facet?: unknown };
    const type: SpecFieldType = o.type === 'number' || o.type === 'boolean' ? o.type : 'string';
    return { key, type, facet: o.facet === true };
  });
}

function specSchemaFrom(fields: SpecFieldRow[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.facet ? { type: f.type, facet: true } : { type: f.type }]),
  );
}

function CategoryItem({
  category,
  categories,
  onSave,
  onDelete,
}: {
  category: Category;
  categories: Category[];
  onSave: (patch: CategoryPatch) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [parent, setParent] = useState(category.parent_id ?? '');
  const [order, setOrder] = useState(String(category.sort_order));
  const [fields, setFields] = useState(() => specFieldList(category.spec_schema));
  const [newField, setNewField] = useState('');
  const [confirm, setConfirm] = useState(false);
  const parentName = categories.find((c) => c.id === category.parent_id)?.name;
  const setField = (i: number, patch: Partial<SpecFieldRow>) =>
    setFields(fields.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <li className="p-2">
      <div className="flex items-center gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <span
            className={`font-medium ${category.is_active ? '' : 'text-muted-foreground line-through'}`}
          >
            {category.name}
          </span>
          <span className="ml-2 text-[11px] text-muted-foreground">
            {parentName ? `in ${parentName} · ` : ''}
            {fields.length} spec field{fields.length === 1 ? '' : 's'}
            {category.is_active ? '' : ' · hidden'}
          </span>
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onSave({ is_active: !category.is_active })}
          title={category.is_active ? 'Hide from the shop' : 'Show on the shop'}
          aria-label={category.is_active ? `Hide ${category.name}` : `Show ${category.name}`}
        >
          {category.is_active ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setOpen(!open)}
          aria-label={`Edit ${category.name}`}
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-3 rounded-lg bg-secondary/40 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem]">
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Inside">
              <select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">Top level</option>
                {categories
                  .filter((c) => c.id !== category.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Order">
              <input
                className="input"
                type="number"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </Field>
          </div>
          <div>
            <p className="label mb-1">Spec fields for products in this category</p>
            <ul className="space-y-1">
              {fields.map((f, i) => (
                <li key={f.key} className="flex items-center gap-1.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{specLabel(f.key)}</span>
                  <select
                    className="input h-7 w-28"
                    value={f.type}
                    onChange={(e) => setField(i, { type: e.target.value as SpecFieldType })}
                    aria-label={`${f.key} type`}
                  >
                    <option value="string">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Yes / no</option>
                  </select>
                  <label
                    className="flex items-center gap-1 text-[11px]"
                    title="Customers can filter by it"
                  >
                    <input
                      type="checkbox"
                      checked={f.facet}
                      onChange={(e) => setField(i, { facet: e.target.checked })}
                    />
                    Filter
                  </label>
                  <button
                    type="button"
                    className="btn-ghost h-7 w-7 px-0"
                    aria-label={`Remove ${f.key}`}
                    onClick={() => setFields(fields.filter((_, j) => j !== i))}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 flex gap-1.5">
              <input
                className="input h-8"
                placeholder="New field, e.g. Refresh rate (Hz)"
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={!specKey(newField) || fields.some((f) => f.key === specKey(newField))}
                onClick={() => {
                  setFields([...fields, { key: specKey(newField), type: 'string', facet: false }]);
                  setNewField('');
                }}
              >
                Add field
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Removing a field doesn’t delete values already saved on products; they show as extra
              specs.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className={confirm ? 'btn-secondary text-destructive' : 'btn-ghost text-destructive'}
              onClick={() => (confirm ? onDelete() : setConfirm(true))}
            >
              <Trash2 className="size-3.5" aria-hidden /> {confirm ? 'Yes, delete it' : 'Delete'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!name.trim() || !Number.isInteger(Number(order))}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  parent_id: parent || null,
                  sort_order: Number(order),
                  spec_schema: specSchemaFrom(fields),
                })
              }
            >
              Save category
            </button>
          </div>
        </div>
      )}
    </li>
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
  categories,
  brands,
  onSaveDetails,
  onSaveVariantDetails,
  onMoveImage,
  onSetImageAlt,
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
  categories: Category[];
  brands: Brand[];
  onSaveDetails: (d: ProductDetails) => void;
  onSaveVariantDetails: (id: string, d: VariantDetails) => void;
  onMoveImage: (id: string, dir: -1 | 1) => void;
  onSetImageAlt: (id: string, alt: string) => void;
}) {
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [specs, setSpecs] = useState<Specs>(product.specs);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [editingAlt, setEditingAlt] = useState<{ id: string; alt: string } | null>(null);
  const specsDirty =
    JSON.stringify(cleanSpecs(specs)) !== JSON.stringify(cleanSpecs(product.specs));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{product.title}</p>
          <p className="mt-0.5 text-muted-foreground">
            {product.category ?? 'No category'} · {product.brand ?? 'No brand'}
            {product.model ? ` · ${product.model}` : ''} ·{' '}
            {product.warranty_months
              ? `${product.warranty_months}-month warranty${product.warranty_provider ? ` (${product.warranty_provider})` : ''}`
              : 'No warranty'}
          </p>
          {product.description ? (
            <p className="mt-1.5 line-clamp-2 text-[13px] text-muted-foreground">
              {product.description}
            </p>
          ) : (
            <p className="mt-1.5 text-[13px] text-amber-700">No description yet.</p>
          )}
        </div>
        <button type="button" className="btn-secondary" onClick={() => setEditingDetails(true)}>
          <Pencil className="size-3.5" aria-hidden /> Edit details
        </button>
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
          <p className="text-[11px] text-muted-foreground">
            First image is the main photo · PNG, JPEG, WebP or AVIF · max 2 MB
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.images.map((img, i) => (
            <div key={img.id} className="w-24 space-y-1">
              <div className="group relative size-24 overflow-hidden rounded-lg border bg-secondary/40">
                <img
                  src={imageUrl(img.storage_path)}
                  alt={img.alt ?? ''}
                  className="size-full object-contain p-1"
                />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-foreground/80 px-1 text-[10px] font-medium text-background">
                    Main
                  </span>
                )}
                <button
                  type="button"
                  title="Remove image"
                  aria-label="Remove image"
                  onClick={() => onDeleteImage(img.id, img.storage_path)}
                  className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded-md bg-card/90 text-destructive shadow-sm group-hover:flex"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="btn-ghost h-6 w-6 px-0"
                  disabled={i === 0}
                  aria-label="Move image left"
                  onClick={() => onMoveImage(img.id, -1)}
                >
                  <ChevronLeft className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={`h-6 truncate px-1 text-[11px] ${img.alt ? 'text-muted-foreground' : 'text-amber-700'}`}
                  title={img.alt ?? 'Add a description for screen readers and search'}
                  onClick={() => setEditingAlt({ id: img.id, alt: img.alt ?? '' })}
                >
                  {img.alt ? 'Alt ✓' : 'Add alt'}
                </button>
                <button
                  type="button"
                  className="btn-ghost h-6 w-6 px-0"
                  disabled={i === product.images.length - 1}
                  aria-label="Move image right"
                  onClick={() => onMoveImage(img.id, 1)}
                >
                  <ChevronRight className="size-3.5" aria-hidden />
                </button>
              </div>
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
                  variant={v}
                  onSave={(p, s) => onSaveVariant(v.id, p, s)}
                  onToggle={() => onToggleVariant(v.id, !v.is_active)}
                  onDetails={() => setEditingVariant(v)}
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

      {editingDetails && (
        <Modal title={`Edit ${product.title}`} onClose={() => setEditingDetails(false)} wide>
          <ProductDetailsForm
            product={product}
            categories={categories}
            brands={brands}
            onSave={(d) => {
              setEditingDetails(false);
              onSaveDetails(d);
            }}
          />
        </Modal>
      )}
      {editingVariant && (
        <Modal title={`Variant ${editingVariant.sku}`} onClose={() => setEditingVariant(null)}>
          <VariantDetailsForm
            variant={editingVariant}
            onSave={(d) => {
              const id = editingVariant.id;
              setEditingVariant(null);
              onSaveVariantDetails(id, d);
            }}
          />
        </Modal>
      )}
      {editingAlt && (
        <Modal title="Image description" onClose={() => setEditingAlt(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSetImageAlt(editingAlt.id, editingAlt.alt);
              setEditingAlt(null);
            }}
          >
            <Field
              label="Describe the photo"
              hint="Read aloud to blind customers and used by search engines, e.g. “iPhone 15 in blue, front and back”."
            >
              <input
                className="input"
                autoFocus
                maxLength={200}
                value={editingAlt.alt}
                onChange={(e) => setEditingAlt({ ...editingAlt, alt: e.target.value })}
              />
            </Field>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary">
                Save description
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function VariantRow({
  variant,
  onSave,
  onToggle,
  onDetails,
}: {
  variant: Variant;
  onSave: (priceCedis: number, stock: number) => void;
  onToggle: () => void;
  onDetails: () => void;
}) {
  const { sku, price, stock, is_active: active } = variant;
  const options = Object.entries(variant.attrs)
    .map(([k, v]) => `${specLabel(k)}: ${v}`)
    .join(' · ');
  const [p, setP] = useState((price / 100).toFixed(2));
  const [s, setS] = useState(String(stock));
  const dirty = p !== (price / 100).toFixed(2) || s !== String(stock);

  return (
    <tr className={active ? '' : 'opacity-60'}>
      <td>
        <p className="font-mono text-xs">{sku}</p>
        <p className="text-[11px] text-muted-foreground">
          Now {formatGHS(price)}
          {variant.compare_at_price ? (
            <span className="ml-1 text-destructive">
              (sale · was <s>{formatGHS(variant.compare_at_price)}</s>)
            </span>
          ) : null}
        </p>
        {options && <p className="text-[11px] text-muted-foreground">{options}</p>}
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
          <button
            type="button"
            className="btn-ghost"
            onClick={onDetails}
            title="SKU, options, weight and sale price"
            aria-label={`Details for ${sku}`}
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProductDetailsForm({
  product,
  categories,
  brands,
  onSave,
}: {
  product: ProductRow;
  categories: Category[];
  brands: Brand[];
  onSave: (d: ProductDetails) => void;
}) {
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description ?? '');
  const [model, setModel] = useState(product.model ?? '');
  const [categoryId, setCategoryId] = useState(product.category_id ?? '');
  const [brandId, setBrandId] = useState(product.brand_id ?? '');
  const [months, setMonths] = useState(String(product.warranty_months));
  const [provider, setProvider] = useState(product.warranty_provider ?? '');
  const monthsN = Number(months);
  const valid = title.trim() && categoryId && brandId && Number.isInteger(monthsN) && monthsN >= 0;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave({
          title,
          description,
          model,
          category_id: categoryId,
          brand_id: brandId,
          warranty_months: monthsN,
          warranty_provider: provider,
        });
      }}
    >
      <Field
        label="Title"
        hint={`Web address stays /p/${product.slug} so existing links keep working.`}
      >
        <input
          className="input"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Description" hint="Shown on the product page and used by search.">
        <textarea
          className="input min-h-28 py-2"
          value={description}
          maxLength={5000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Brand">
          <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model number">
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
        </Field>
        <Field label="Warranty (months)" hint="0 = no warranty">
          <input
            className="input"
            type="number"
            min={0}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Warranty provided by" hint="e.g. Apple Ghana, ExtraMile">
        <input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} />
      </Field>
      {categoryId !== (product.category_id ?? '') && (
        <Notice tone="info">
          Changing the category changes which spec fields the product page shows; values already
          entered are kept.
        </Notice>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={!valid}>
          Save details
        </button>
      </div>
    </form>
  );
}

function VariantDetailsForm({
  variant,
  onSave,
}: {
  variant: Variant;
  onSave: (d: VariantDetails) => void;
}) {
  const [sku, setSku] = useState(variant.sku);
  const [options, setOptions] = useState<[string, string][]>(() => {
    const e = Object.entries(variant.attrs);
    return e.length
      ? e
      : [
          ['color', ''],
          ['storage', ''],
        ];
  });
  const [weight, setWeight] = useState(String(variant.weight_grams));
  const [onSale, setOnSale] = useState(variant.compare_at_price !== null);
  const [wasPrice, setWasPrice] = useState(pesewasToInput(variant.compare_at_price));
  const wasP = onSale ? cedisInputToPesewas(wasPrice) : null;
  const weightN = Number(weight);
  const errors = [
    !sku.trim() && 'Enter a SKU.',
    !(Number.isInteger(weightN) && weightN > 0) && 'Weight: whole grams above 0.',
    onSale &&
      (wasP === null || wasP <= variant.price) &&
      `The “was” price must be above the selling price (${formatGHS(variant.price)}).`,
  ].filter(Boolean) as string[];

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (errors.length) return;
        onSave({
          sku,
          attrs: Object.fromEntries(options.map(([k, v]) => [specKey(k), v])),
          weight_grams: weightN,
          compare_at_price: onSale ? wasP : null,
        });
      }}
    >
      <Field label="SKU">
        <input className="input font-mono" value={sku} onChange={(e) => setSku(e.target.value)} />
      </Field>
      <div>
        <p className="label mb-1">Options customers choose between</p>
        <div className="space-y-1.5">
          {options.map(([k, v], i) => (
            <div key={i} className="flex gap-1.5">
              <input
                className="input w-36"
                placeholder="Option, e.g. Colour"
                value={k}
                onChange={(e) =>
                  setOptions(options.map((o, j) => (j === i ? [e.target.value, o[1]] : o)))
                }
              />
              <input
                className="input"
                placeholder="Value, e.g. Blue"
                value={v}
                onChange={(e) =>
                  setOptions(options.map((o, j) => (j === i ? [o[0], e.target.value] : o)))
                }
              />
              <button
                type="button"
                className="btn-ghost w-8 px-0"
                aria-label="Remove option"
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setOptions([...options, ['', '']])}
          >
            <Plus className="size-3.5" aria-hidden /> Add option
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Empty rows are ignored.</p>
      </div>
      <Field label="Weight (grams)" hint="Used for packing and couriers.">
        <input
          className="input"
          type="number"
          min={1}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </Field>
      <div className="space-y-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-[13px] font-medium">
          <input type="checkbox" checked={onSale} onChange={(e) => setOnSale(e.target.checked)} />
          On sale — show a struck-through “was” price
        </label>
        {onSale && (
          <Field
            label="Was (GH₵)"
            hint={`Customers pay ${formatGHS(variant.price)}; change that in the variant table.`}
          >
            <input
              className="input"
              type="number"
              min={0.01}
              step="0.01"
              value={wasPrice}
              onChange={(e) => setWasPrice(e.target.value)}
            />
          </Field>
        )}
      </div>
      {errors.length > 0 && <Notice tone="error">{errors[0]}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={errors.length > 0}>
          Save variant
        </button>
      </div>
    </form>
  );
}
