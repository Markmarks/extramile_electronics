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
import { REDIRECT_URI, supabase } from '../lib/supabase';
import { oauthListen, openExternal, secureClear, secureGet, secureSet } from '../lib/tauri';

type Role = 'customer' | 'staff' | 'admin' | null;
const REFRESH_KEY = 'sb-refresh';

interface AuthState {
  user: User | null;
  role: Role;
  loading: boolean;
  error: string | null;
  locked: boolean;
  signInGoogle: () => Promise<void>;
  signInPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  lock: () => void;
  unlock: (password: string) => Promise<boolean>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth used outside AuthProvider');
  return c;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  // Post-login staff gate — non-staff are signed out (D-02).
  const gate = useCallback(async (u: User) => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', u.id)
      .returns<{ role: 'customer' | 'staff' | 'admin' }[]>();
    const r = data?.[0]?.role ?? null;
    if (r === 'staff' || r === 'admin') {
      setUser(u);
      setRole(r);
      setError(null);
    } else {
      setError('This account has no back-office access.');
      await supabase.auth.signOut({ scope: 'local' });
      setUser(null);
      setRole(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const rt = await secureGet(REFRESH_KEY);
      if (rt) {
        const { data } = await supabase.auth.refreshSession({ refresh_token: rt });
        if (mounted && data.user) await gate(data.user);
      }
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.refresh_token) void secureSet(REFRESH_KEY, session.refresh_token);
      if (event === 'SIGNED_OUT') {
        void secureClear(REFRESH_KEY);
        setUser(null);
        setRole(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [gate]);

  const signInGoogle = useCallback(async () => {
    setError(null);
    const { data, error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: REDIRECT_URI,
        skipBrowserRedirect: true,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (e || !data.url) {
      setError('Could not start Google sign-in.');
      return;
    }
    await openExternal(data.url); // system browser — Google blocks embedded webviews
    const code = await oauthListen(); // loopback captures ?code=…
    const { data: ex, error: xe } = await supabase.auth.exchangeCodeForSession(code);
    if (xe || !ex.user) {
      setError('Sign-in failed.');
      return;
    }
    await gate(ex.user);
  }, [gate]);

  const signInPassword = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (e || !data.user) {
        setError(e?.message ?? 'Sign-in failed.');
        return;
      }
      await gate(data.user);
    },
    [gate],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    await secureClear(REFRESH_KEY);
    setUser(null);
    setRole(null);
    setLocked(false);
  }, []);

  const lock = useCallback(() => {
    setUser((u) => {
      if (u) setLocked(true);
      return u;
    });
  }, []);

  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      if (!user?.email) return false;
      const { error: e } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (e) return false;
      setLocked(false);
      return true;
    },
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      role,
      loading,
      error,
      locked,
      signInGoogle,
      signInPassword,
      signOut,
      lock,
      unlock,
    }),
    [user, role, loading, error, locked, signInGoogle, signInPassword, signOut, lock, unlock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
