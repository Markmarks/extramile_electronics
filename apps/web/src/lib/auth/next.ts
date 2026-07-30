/**
 * Validate a post-auth redirect target. Must be a path on our own origin — a single
 * leading slash, never `//` or `/\` (open-redirect vectors). O-06 in docs/05-OAUTH.md §10.
 */
export function sanitizeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) {
    return raw;
  }
  return fallback;
}
