/**
 * Validate a post-auth redirect target. Must be a path on our own origin — a single
 * leading slash, never `//` or `/\` (open-redirect vectors). O-06 in docs/05-OAUTH.md §10.
 *
 * Prefix checks alone are not enough: the WHATWG URL parser silently drops tab/CR/LF, so
 * "/\t/evil.com" passed them and resolved to https://evil.com (docs/08-SECURITY V-03).
 * So reject control characters and backslashes outright, then let the parser resolve the
 * path and keep it only if it stays on our origin.
 */
const PROBE_ORIGIN = 'https://next.invalid';

export function sanitizeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  const out = `${url.pathname}${url.search}${url.hash}`;
  // "/.//evil.com" normalises to "//evil.com", which is protocol-relative once reused.
  return out.startsWith('//') ? fallback : out;
}
