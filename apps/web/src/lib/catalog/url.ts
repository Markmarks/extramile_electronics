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
