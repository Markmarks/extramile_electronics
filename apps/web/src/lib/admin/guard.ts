import 'server-only';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Defense-in-depth staff check for /admin server components (middleware already
 * 404s non-staff; this re-checks server-side). Non-staff get notFound (404).
 */
export async function requireStaff(): Promise<{ userId: string; role: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .returns<{ role: string }[]>();
  const role = data?.[0]?.role;
  if (role !== 'staff' && role !== 'admin') notFound();
  return { userId: user.id, role };
}
