'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const inputClass = 'field';
const MIN_PASSWORD = 8;

type Mode = 'signin' | 'signup';

/**
 * Email/password sign-in and account creation, plus a magic-link fallback.
 * docs/05-OAUTH.md §1. New accounts get a `profiles` row from the
 * on_auth_user_created trigger, which reads `full_name` from user metadata.
 */
export function EmailAuthForm({ next = '/' }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  function switchMode(to: Mode) {
    setMode(to);
    setError(null);
    setNotice(null);
  }

  async function signInPassword() {
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function signUp() {
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl(),
        data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
      },
    });
    if (err) {
      setError(err.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off for this project: the user is signed in already.
      router.push(next);
      router.refresh();
      return;
    }
    // Same message whether or not the address was already registered, so the form
    // can't be used to probe which emails have accounts.
    setNotice('Check your email to confirm your account, then sign in.');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await (isSignup ? signUp() : signInPassword());
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice('Check your email for a sign-in link.');
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      {isSignup && (
        <div>
          <label htmlFor="full-name" className="field-label">
            Full name
          </label>
          <input
            id="full-name"
            type="text"
            autoComplete="name"
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
      )}
      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required={isSignup}
          minLength={isSignup ? MIN_PASSWORD : undefined}
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isSignup && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            At least {MIN_PASSWORD} characters.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      {notice && <p className="text-[13px] text-success">{notice}</p>}

      <button type="submit" className="btn-primary w-full" disabled={busy || !email}>
        {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
      </button>
      {!isSignup && (
        <button
          type="button"
          className="btn w-full text-[15px] text-primary hover:bg-primary/5"
          disabled={busy || !email}
          onClick={sendMagicLink}
        >
          Email me a magic link instead
        </button>
      )}

      <p className="pt-1 text-center text-[13px] text-muted-foreground">
        {isSignup ? 'Already have an account?' : 'New here?'}{' '}
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
        >
          {isSignup ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </form>
  );
}
