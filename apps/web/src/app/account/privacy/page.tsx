import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DeleteAccountForm, MarketingForm } from '@/components/account/privacy-forms';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your data & privacy' };
export const dynamic = 'force-dynamic';

export default async function AccountPrivacyPage() {
  // Middleware already guards /account; getUser() is the authoritative check.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = user
    ? await supabase
        .from('profiles')
        .select('marketing_opt_in')
        .eq('id', user.id)
        .limit(1)
        .returns<{ marketing_opt_in: boolean }[]>()
    : { data: null };
  const optedIn = data?.[0]?.marketing_opt_in ?? false;

  return (
    <main className="container max-w-2xl space-y-6 pb-20 pt-6">
      <div>
        <Breadcrumbs trail={[{ label: 'Account', href: '/account' }, { label: 'Privacy' }]} />
        <h1 className="large-title">Your data &amp; privacy</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          How we use your data is explained in our{' '}
          <Link href="/privacy" className="text-primary hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </div>

      <section className="panel space-y-3">
        <h2 className="text-[17px] font-semibold">Download your data</h2>
        <p className="text-[15px] text-muted-foreground">
          A file with your account details, addresses, orders, reviews and marketing choices.
        </p>
        <a href="/api/account/export" className="btn-tinted btn-sm" download>
          <Download className="size-4" aria-hidden /> Download (JSON)
        </a>
      </section>

      <section className="panel space-y-3">
        <h2 className="text-[17px] font-semibold">Marketing emails</h2>
        <MarketingForm optedIn={optedIn} />
      </section>

      <section className="panel space-y-3 ring-1 ring-destructive/20">
        <h2 className="text-[17px] font-semibold text-destructive">Delete your account</h2>
        <p className="text-[15px] text-muted-foreground">
          This permanently deletes your account, saved addresses, bag and reviews, and signs you
          out. It can&apos;t be undone. Records of past orders are kept — without a link to your
          account — because tax law and your warranties require them.
        </p>
        <DeleteAccountForm />
      </section>
    </main>
  );
}
