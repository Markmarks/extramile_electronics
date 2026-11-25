/**
 * POST /api/revalidate — the back-office asks the storefront to drop its cached catalogue
 * pages after an edit (e.g. iPhone 15 → Fairly used). Only staff/admin may trigger it,
 * and only the back-office origins get CORS headers.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

// Fake Supabase: token → user, user → role.
const users: Record<string, { id: string; role: string | null }> = {
  'staff-token': { id: 'u-staff', role: 'staff' },
  'admin-token': { id: 'u-admin', role: 'admin' },
  'customer-token': { id: 'u-cust', role: 'customer' },
  'no-profile-token': { id: 'u-none', role: null },
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    let uid = '';
    return {
      auth: {
        getUser: async (token: string) => {
          const u = users[token];
          uid = u?.id ?? '';
          return { data: { user: u ? { id: u.id } : null }, error: null };
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            returns: async () => {
              const u = Object.values(users).find((x) => x.id === uid);
              return { data: u?.role ? [{ role: u.role }] : [], error: null };
            },
          }),
        }),
      }),
    };
  },
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';

const { POST, OPTIONS } = await import('../../src/app/api/revalidate/route');

function req(method: string, headers: Record<string, string> = {}) {
  return new NextRequest('https://www.dnvmart.com/api/revalidate', { method, headers });
}

beforeEach(() => revalidatePath.mockClear());

describe('POST /api/revalidate', () => {
  it.each(['staff-token', 'admin-token'])('refreshes every cached page for %s', async (t) => {
    const res = await POST(
      req('POST', { authorization: `Bearer ${t}`, origin: 'http://tauri.localhost' }),
    );
    expect(res.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://tauri.localhost');
  });

  it('rejects a missing or unknown token without refreshing', async () => {
    expect((await POST(req('POST'))).status).toBe(401);
    expect((await POST(req('POST', { authorization: 'Bearer nope' }))).status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(['customer-token', 'no-profile-token'])('forbids %s', async (t) => {
    const res = await POST(req('POST', { authorization: `Bearer ${t}` }));
    expect(res.status).toBe(403);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('gives CORS headers only to back-office origins', async () => {
    const evil = await POST(
      req('POST', { authorization: 'Bearer staff-token', origin: 'https://evil.example' }),
    );
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('OPTIONS /api/revalidate (CORS preflight)', () => {
  it.each([
    'http://tauri.localhost',
    'https://tauri.localhost',
    'tauri://localhost',
    'http://localhost:1420',
  ])('allows %s', async (origin) => {
    const res = OPTIONS(req('OPTIONS', { origin }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('refuses other origins', () => {
    expect(OPTIONS(req('OPTIONS', { origin: 'https://evil.example' })).status).toBe(403);
    expect(OPTIONS(req('OPTIONS')).status).toBe(403);
  });
});
