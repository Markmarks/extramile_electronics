import { useEffect, useState } from 'react';
import { deviceId } from '../lib/tauri';

export function Dashboard() {
  const [device, setDevice] = useState('');

  useEffect(() => {
    void deviceId().then(setDevice);
  }, []);

  return (
    <main style={{ padding: '1.5rem' }}>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <p className="muted">
        Use the <strong>Orders</strong> tab to fulfil orders — pack, scan serials, dispatch and
        print receipts, online or offline. Catalogue, inventory, reports and walk-in sales continue
        in later increments.
      </p>
      <p className="muted">Device id: {device}</p>
    </main>
  );
}
