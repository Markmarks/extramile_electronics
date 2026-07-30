import { useAuth } from './auth/AuthProvider';
import { Login } from './auth/Login';
import { LockOverlay } from './auth/LockOverlay';
import { useIdleLock } from './hooks/useIdleLock';
import { Shell } from './screens/Shell';

const IDLE_MS = 15 * 60 * 1000;

export function App() {
  const { user, loading, locked, lock } = useAuth();
  useIdleLock(Boolean(user), IDLE_MS, lock);

  if (loading) {
    return (
      <div className="center">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!user) return <Login />;

  return (
    <>
      {locked && <LockOverlay />}
      <Shell />
    </>
  );
}
