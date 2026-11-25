import type { User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import {
  deviceDescription,
  deviceId,
  pinEnroll,
  pinLock,
  pinReset,
  pinStatus,
  pinUnlock,
  sessionReseal,
} from '../lib/tauri';
import { classifyRefreshError, unlockFailureMessage, type UnlockFailure } from './unlockError';

type Role = 'customer' | 'staff' | 'admin' | null;

/**
 * loading — checking whether this device is enrolled
 * enroll  — one-time bind of a real admin account, then set a 6-digit PIN
 * locked  — enrolled; waiting for the PIN to unlock the stored session
 * ready   — session restored; full back-office access
 */
export type Phase = 'loading' | 'enroll' | 'locked' | 'ready';

interface AuthState {
  phase: Phase;
  user: User | null;
  role: Role;
  error: string | null;
  /** Why the last PIN unlock couldn't restore the session (null when it didn't get that far). */
  unlockFailure: UnlockFailure | null;
  /** First-time device enrolment: verify an admin account once, then seal it under `pin`. */
  enroll: (email: string, password: string, pin: string) => Promise<void>;
  /** Daily unlock — restores the stored Supabase session from the PIN. */
  unlock: (pin: string) => Promise<void>;
  /** Idle/manual lock — drops the session, keeps the enrolment (PIN re-entry). */
  lock: () => void;
  /** Forget this device — wipes the vault and returns to enrolment. */
  signOut: () => Promise<void>;
  /** Change the signed-in user's password. Returns an error message, or null on success. */
  updatePassword: (newPassword: string) => Promise<string | null>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth used outside AuthProvider');
  return c;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlockFailure, setUnlockFailure] = useState<UnlockFailure | null>(null);

  // Post-restore staff gate — the bound account must still be staff/admin (D-02).
  // Returns the role on success, or null (and signs the local session out) otherwise.
  const gate = useCallback(async (u: User): Promise<Role | 'revoked'> => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', u.id)
      .returns<{ role: 'customer' | 'staff' | 'admin' }[]>();
    const r = data?.[0]?.role ?? null;
    if (r !== 'staff' && r !== 'admin') {
      await supabase.auth.signOut({ scope: 'local' });
      return null;
    }
    // Register this PC (or refresh last_seen) and learn whether an admin revoked it.
    const d = deviceDescription();
    const { data: revoked, error: regErr } = await supabase.rpc('register_staff_device', {
      p_device_id: await deviceId(),
      p_label: d.label,
      p_os: d.os,
      p_app_version: d.appVersion,
    });
    if (regErr) {
      // Fail closed only on an explicit revocation; a registry hiccup shouldn't lock the
      // counter out (admin-actions still refuses revoked devices server-side).
      console.warn('device registration failed:', regErr.message);
    } else if (revoked === true) {
      await supabase.auth.signOut({ scope: 'local' });
      await pinReset().catch(() => {});
      return 'revoked';
    }
    return r;
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const enrolled = await pinStatus();
      if (mounted) setPhase(enrolled ? 'locked' : 'enroll');
    })();

    // Persist rotated refresh tokens back into the vault (cached key, no PIN prompt).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session?.refresh_token) {
        // A failed reseal leaves the previous (now rotated-out) token in the vault, so the
        // next unlock is rejected — make that visible instead of swallowing it.
        void sessionReseal(session.refresh_token).catch((err: unknown) =>
          console.warn('session reseal after token refresh failed:', err),
        );
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const enroll = useCallback(
    async (email: string, password: string, pin: string) => {
      setError(null);
      const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (e || !data.user || !data.session) {
        setError(e?.message ?? 'Sign-in failed.');
        return;
      }
      const r = await gate(data.user);
      if (r === 'revoked') {
        setError('This PC has been revoked by an admin. Ask an admin to restore it.');
        return;
      }
      if (!r) {
        setError('This account has no back-office access.');
        return;
      }
      try {
        await pinEnroll(pin, data.session.refresh_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not set PIN.');
        await supabase.auth.signOut({ scope: 'local' });
        return;
      }
      setUser(data.user);
      setRole(r);
      setPhase('ready');
    },
    [gate],
  );

  const unlock = useCallback(
    async (pin: string) => {
      setError(null);
      setUnlockFailure(null);
      let refreshToken: string;
      try {
        refreshToken = await pinUnlock(pin);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('wrong_pin:')) {
          setError(`Wrong PIN — ${msg.split(':')[1]} attempts left.`);
        } else if (msg === 'wiped') {
          setError('Too many wrong PINs. This device was wiped — re-enrol.');
          setPhase('enroll');
        } else {
          setError('Unlock failed.');
        }
        return;
      }
      let data: Awaited<ReturnType<typeof supabase.auth.refreshSession>>['data'];
      let e: unknown;
      try {
        ({ data, error: e } = await supabase.auth.refreshSession({ refresh_token: refreshToken }));
      } catch (thrown) {
        data = { user: null, session: null };
        e = thrown;
      }
      if (e || !data.user) {
        // Keep the vault either way: a network blip must not push staff into wiping it.
        const kind = classifyRefreshError(e);
        console.warn(`PIN unlock: refreshSession failed (${kind}):`, e ?? 'no user returned');
        setUnlockFailure(kind);
        setError(unlockFailureMessage(kind, e));
        return;
      }
      const r = await gate(data.user);
      if (r === 'revoked') {
        setError('This PC has been revoked by an admin. Ask an admin to restore it.');
        setPhase('enroll');
        return;
      }
      if (!r) {
        setError('This account no longer has back-office access.');
        await pinReset();
        setPhase('enroll');
        return;
      }
      setUser(data.user);
      setRole(r);
      setPhase('ready');
    },
    [gate],
  );

  const lock = useCallback(() => {
    // Drop the live session so auto-refresh stops rotating the token past what's
    // sealed (scope 'local' keeps the sealed refresh token valid for unlock).
    void supabase.auth.signOut({ scope: 'local' });
    void pinLock();
    setUser(null);
    setRole(null);
    setError(null);
    setUnlockFailure(null);
    setPhase('locked');
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    await pinReset();
    setUser(null);
    setRole(null);
    setError(null);
    setUnlockFailure(null);
    setPhase('enroll');
  }, []);

  const updatePassword = useCallback(async (newPassword: string): Promise<string | null> => {
    const { error: e } = await supabase.auth.updateUser({ password: newPassword });
    if (e) return e.message;
    // If changing the password rotated the refresh token, keep the PIN vault in sync.
    const { data } = await supabase.auth.getSession();
    if (data.session?.refresh_token) {
      await sessionReseal(data.session.refresh_token).catch((err: unknown) =>
        console.warn('session reseal after password change failed:', err),
      );
    }
    return null;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      phase,
      user,
      role,
      error,
      unlockFailure,
      enroll,
      unlock,
      lock,
      signOut,
      updatePassword,
    }),
    [phase, user, role, error, unlockFailure, enroll, unlock, lock, signOut, updatePassword],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
