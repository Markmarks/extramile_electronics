import type { Metadata } from 'next';
import { ConnectedAccounts } from '@/components/auth/connected-accounts';

export const metadata: Metadata = { title: 'Connected accounts' };

export default function ConnectedAccountsPage() {
  return (
    <main className="container max-w-2xl space-y-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Connected accounts</h1>
        <p className="text-sm text-muted-foreground">
          Link Google or Apple so you can sign in either way.
        </p>
      </div>
      <ConnectedAccounts />
    </main>
  );
}
