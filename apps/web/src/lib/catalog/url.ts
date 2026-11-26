/** Next 15 search params: a value may repeat (string[]). */
export type RawSearchParams = { [key: string]: string | string[] | undefined };

/** Collapse repeated params to their first value for single-value facet handling. */
export function flattenParams(sp: RawSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

/** Build a filtered URL by patching the current query params. `null` removes a key. */
export function buildFacetHref(
  pathname: string,
  current: Record<string, string | undefined>,
  patch: Record<string, string | null>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v) sp.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) sp.delete(k);
    else sp.set(k, v);
  }
  sp.delete('page'); // any filter change resets pagination
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Build a URL that preserves current filters and sets the page (drops `page` for page 1). */
export function buildPageHref(
  pathname: string,
  current: Record<string, string | undefined>,
  page: number,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== 'page') sp.set(k, v);
  }
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Price bands offered as one-tap filters. Bounds are whole cedis, as in the URL. */
export const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under GH₵ 1,000', max: 1000 },
  { label: 'GH₵ 1,000 – 5,000', min: 1000, max: 5000 },
  { label: 'GH₵ 5,000 – 10,000', min: 5000, max: 10000 },
  { label: 'Over GH₵ 10,000', min: 10000 },
];
export const STORAGE_STEPS_GB = [64, 128, 256, 512, 1024] as const;
export const RAM_STEPS_GB = [4, 8, 16, 32] as const;

/** Largest cedi amount accepted in a price filter (well above any real product). */
const MAX_FILTER_CEDIS = 10_000_000;

/** A whole-cedi URL value → pesewas, or undefined when missing/invalid. */
export function parseCedisParam(raw: string | undefined): number | undefined {
  if (!raw || !/^\d{1,8}$/.test(raw.trim())) return undefined;
  const cedis = Number.parseInt(raw.trim(), 10);
  if (cedis > MAX_FILTER_CEDIS) return undefined;
  return cedis * 100;
}

function parseStep(raw: string | undefined, steps: readonly number[]): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return steps.includes(n) ? n : undefined;
}

/**
 * Numeric facet filters from the URL. Prices arrive in whole cedis (`min_price=1000`) and
 * leave as pesewas for search_products(); a reversed range is swapped rather than
 * returning nothing. Storage/RAM accept only the offered steps.
 */
export function parseNumericFilters(sp: Record<string, string | undefined>): {
  minPrice?: number;
  maxPrice?: number;
  minStorageGb?: number;
  minRamGb?: number;
} {
  let minPrice = parseCedisParam(sp.min_price);
  let maxPrice = parseCedisParam(sp.max_price);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  return {
    minPrice,
    maxPrice,
    minStorageGb: parseStep(sp.storage, STORAGE_STEPS_GB),
    minRamGb: parseStep(sp.ram, RAM_STEPS_GB),
  };
}

export function parseSort(
  raw: string | undefined,
): 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating' {
  switch (raw) {
    case 'price_asc':
    case 'price_desc':
    case 'newest':
    case 'rating':
      return raw;
    default:
      return 'relevance';
  }
}
