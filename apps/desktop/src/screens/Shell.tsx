import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { OfflineBanner } from '../components/OfflineBanner';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { Dashboard } from './Dashboard';
import { Orders } from './Orders';

type View = 'home' | 'orders';

export function Shell() {
  const { user, role, signOut } = useAuth();
  const { online, lastSync } = useOfflineSync(true);
  const [view, setView] = useState<View>('home');

  return (
    <div className="screen">
      <OfflineBanner online={online} lastSync={lastSync} />
      <header className="topbar">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <strong>ExtraMile Back-office</strong>
          <nav style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn secondary" onClick={() => setView('home')}>
              Home
            </button>
            <button className="btn secondary" onClick={() => setView('orders')}>
              Orders
            </button>
          </nav>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          <span className="muted">
            {user?.email} · {role} · {online ? 'online' : 'offline'}
          </span>
          <button className="btn secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      {view === 'home' ? <Dashboard /> : <Orders />}
    </div>
  );
}
