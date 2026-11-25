import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Is the Supabase project the given app points at reachable? Used by `@backend` tests to
 * skip (not fail) when the hosted project is paused — that is a BLOCKED environment, not
 * a product bug, and scripts/verify-preflight.mjs reports it separately.
 */
export async function supabaseUp(app: 'web' | 'desktop'): Promise<{ ok: boolean; why: string }> {
  const [file, key] =
    app === 'web'
      ? ['apps/web/.env.local', 'NEXT_PUBLIC_SUPABASE_URL']
      : ['apps/desktop/.env', 'VITE_SUPABASE_URL'];
  const path = join(process.cwd(), file);
  if (!existsSync(path)) return { ok: false, why: `${file} missing` };
  const url = readFileSync(path, 'utf8')
    .match(new RegExp(`^${key}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'))?.[1]
    ?.trim();
  if (!url || url.includes('<')) return { ok: false, why: `${key} unset` };
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(8_000) });
    // 401 without an apikey still proves the project is up.
    return { ok: res.status < 500, why: `health HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, why: `Supabase unreachable (${(e as Error).message}) — project paused?` };
  }
}
