import type { Metadata } from 'next';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { EmailAuthForm } from '@/components/auth/email-auth-form';
import { sanitizeNext } from '@/lib/auth/next';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  missing_code: 'That sign-in link was incomplete. Please try again.',
  oauth_failed: 'Sign-in did not complete. Please try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeNext(params.next);
  const errorMessage = params.error ? (ERRORS[params.error] ?? 'Something went wrong.') : null;

  return (
    <main className="container flex min-h-dvh items-center justify-center py-12">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to track orders and check out faster.
          </p>
        </div>

        {errorMessage && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <OAuthButtons next={next} />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <EmailAuthForm next={next} />
      </div>
    </main>
  );
}
