import { KeyRound, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Notice } from './ui';

const MIN_LEN = 6;

/** Change the signed-in account's password. The PIN/session already proves identity,
 *  so we don't re-prompt for the current password. */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { user, updatePassword } = useAuth();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = pw.length > 0 && pw.length < MIN_LEN;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const ready = pw.length >= MIN_LEN && pw === confirm && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const err = await updatePassword(pw);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h2 className="card-title">Change password</h2>
          <button
            type="button"
            className="btn-ghost h-7 w-7 px-0"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="p-4">
          {done ? (
            <div className="space-y-4">
              <Notice tone="ok">
                Password updated. Your PIN and this session still work — the new password is only
                needed when binding another device.
              </Notice>
              <button type="button" className="btn-primary btn-lg w-full" onClick={onClose}>
                Done
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              {user?.email && (
                <p className="text-xs text-muted-foreground">
                  Updating the password for{' '}
                  <span className="font-medium text-foreground">{user.email}</span>.
                </p>
              )}
              <label className="block">
                <span className="label">New password</span>
                <input
                  className="input h-9"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
                {tooShort && (
                  <p className="mt-1 text-xs text-destructive">At least {MIN_LEN} characters.</p>
                )}
              </label>
              <label className="block">
                <span className="label">Confirm password</span>
                <input
                  className={`input h-9 ${mismatch ? 'border-destructive' : ''}`}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {mismatch && (
                  <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
                )}
              </label>

              {error && <Notice tone="error">{error}</Notice>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button className="btn-primary" disabled={!ready}>
                  <KeyRound className="size-4" aria-hidden />
                  {busy ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
