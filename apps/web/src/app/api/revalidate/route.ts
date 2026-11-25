import type { Database } from '@extramile/core';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Drop the storefront's cached catalogue pages (home, categories, search, product pages
 * all use ISR with revalidate = 300). Called by the back-office right after a catalogue
 * write, so a change such as "iPhone 15 → Fairly used" shows immediately instead of
 * after 5+ minutes and one stale visit.
 *
 * Auth: the caller's Supabase access token (Authorization: Bearer …) must belong to a
 * staff or admin profile. No shared secret is needed. The only effect is a cache refresh.
 */

// Same origins as the admin-actions Edge Function: the Tauri webview on Windows
// (http/https://tauri.localhost), macOS/Linux (tauri://localhost) and the Vite dev server.
const ALLOWED_ORIGINS = new Set([
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:1420',
]);

function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function OPTIONS(req: NextRequest) {
  const headers = cors(req);
  return new NextResponse(null, {
    status: headers['Access-Control-Allow-Origin'] ? 204 : 403,
    headers,
  });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers });

  // A client acting as the caller: RLS applies, so it can only read its own profile.
  const supabase = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers });

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .returns<{ role: string }[]>();
  const role = data?.[0]?.role;
  if (role !== 'staff' && role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });
  }

  // Every page under the root layout: home, /c/*, /search, /p/*, sitemap.
  revalidatePath('/', 'layout');
  return NextResponse.json({ revalidated: true }, { headers });
}
