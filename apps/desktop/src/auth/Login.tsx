import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';

export function Login() {
  const { signInGoogle, signInPassword, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onGoogle() {
    setBusy(true);
    await signInGoogle();
    setBusy(false);
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await signInPassword(email, password);
    setBusy(false);
  }

  return (
    <div className="center">
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.2rem' }}>ExtraMile Back-office</h1>
        <p className="muted">Staff accounts only.</p>

        <button className="btn" onClick={onGoogle} disabled={busy}>
          {busy ? 'Working…' : 'Sign in with Google'}
        </button>

        <div className="muted" style={{ textAlign: 'center' }}>
          — or —
        </div>

        <form
          onSubmit={onPassword}
          style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}
        >
          <input
            className="input"
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn secondary" disabled={busy || !email}>
            Sign in with password
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
