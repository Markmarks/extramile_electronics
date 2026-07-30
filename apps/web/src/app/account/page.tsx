import { Button } from '@extramile/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage() {
  // Middleware already guards this route; getUser() is the authoritative check.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="container max-w-2xl space-y-8 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Your account</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <nav className="grid gap-2">
        <Link className="rounded-md border p-4 hover:bg-accent/10" href="/account/orders">
          Orders &amp; tracking
        </Link>
        <Link
          className="rounded-md border p-4 hover:bg-accent/10"
          href="/account/connected-accounts"
        >
          Connected accounts
        </Link>
      </nav>

      <form action="/auth/signout" method="post">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
