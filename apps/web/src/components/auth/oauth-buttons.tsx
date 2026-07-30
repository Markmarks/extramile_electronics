'use client';

import { Button } from '@extramile/ui';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Provider = 'google' | 'apple';

export function OAuthButtons({ next = '/' }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    setError(null);
    setBusy(provider);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams:
          provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined,
      },
    });
    if (err) {
      setBusy(null);
      setError('Could not start sign-in. Try email instead.');
    }
    // On success the browser is redirected to the provider.
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy !== null}
        onClick={() => signIn('google')}
      >
        {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy !== null}
        onClick={() => signIn('apple')}
      >
        {busy === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
