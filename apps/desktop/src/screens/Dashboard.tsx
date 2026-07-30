import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { OfflineBanner } from '../components/OfflineBanner';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { deviceId } from '../lib/tauri';

export function Dashboard() {
  const { user, role, signOut } = useAuth();
  const { online, lastSync } = useOfflineSync(true);
  const [device, setDevice] = useState('');

  useEffect(() => {
    void deviceId().then(setDevice);
  }, []);

  return (
    <div className="screen">
      <OfflineBanner online={online} lastSync={lastSync} />
      <header className="topbar">
        <strong>ExtraMile Back-office</strong>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          <span className="muted">
            {user?.email} · {role}
          </span>
          <button className="btn secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main style={{ padding: '1.5rem' }}>
        <h1 style={{ marginTop: 0 }}>Dashboard</h1>
        <p className="muted">
          Catalogue, inventory, fulfilment, printing and reports arrive in D4–D5. Offline cache +
          outbox are active ({online ? 'online' : 'offline'}).
        </p>
        <p className="muted">Device id: {device}</p>
      </main>
    </div>
  );
}
