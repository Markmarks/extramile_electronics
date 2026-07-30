import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';

/** Full-screen lock after idle — hides all data and requires re-auth (D-14). */
export function LockOverlay() {
  const { unlock, signOut, user } = useAuth();
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await unlock(password);
    if (ok) setPassword('');
    else setWrong(true);
  }

  return (
    <div className="lock-overlay">
      <div className="card">
        <h2 style={{ margin: 0 }}>Session locked</h2>
        <p className="muted">{user?.email}</p>
        <form
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}
        >
          <input
            className="input"
            type="password"
            autoFocus
            placeholder="Password to unlock"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setWrong(false);
            }}
          />
          <button className="btn">Unlock</button>
        </form>
        {wrong && <p className="error">Wrong password (OAuth accounts: sign out and back in).</p>}
        <button className="btn secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
