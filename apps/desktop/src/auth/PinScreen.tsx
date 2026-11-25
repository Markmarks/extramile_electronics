import { LogoMark } from '@extramile/ui';
import { Delete, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';

const PIN_LEN = 6;
const onlyDigits = (s: string) => s.replace(/\D/g, '').slice(0, PIN_LEN);

/** Enrolment (first run) and daily PIN unlock — the desktop's only login screen. */
export function PinScreen() {
  const { phase } = useAuth();
  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark className="h-12" />
          <div>
            <p className="font-display text-lg font-bold tracking-tight">ExtraMile Back-office</p>
            <p className="text-muted-foreground">
              {phase === 'enroll' ? 'Set up this device' : 'Enter your PIN to continue'}
            </p>
          </div>
        </div>
        {phase === 'enroll' ? <Enroll /> : <Unlock />}
      </div>
    </div>
  );
}

/** Six boxes that mirror a hidden numeric input, like a bank-card PIN pad. */
function PinBoxes({ value, error }: { value: string; error?: boolean }) {
  return (
    <div className="flex justify-center gap-2" aria-hidden>
      {Array.from({ length: PIN_LEN }, (_, i) => (
        <span
          key={i}
          className={`flex size-11 items-center justify-center rounded-lg border bg-card text-lg transition-colors ${
            error
              ? 'border-destructive'
              : i === value.length
                ? 'border-primary ring-2 ring-primary/20'
                : ''
          }`}
        >
          {i < value.length ? '•' : ''}
        </span>
      ))}
    </div>
  );
}

/** One-time device bind: verify a real admin account once, then choose a 6-digit PIN. */
function Enroll() {
  const { enroll, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length === PIN_LEN && pin !== confirm;
  const ready = email && password && pin.length === PIN_LEN && pin === confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    await enroll(email, password, pin);
    setBusy(false);
  }

  return (
    <form className="card space-y-4 p-5" onSubmit={onSubmit}>
      <div className="flex gap-3 rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        Sign in once with a staff or admin account to bind this PC, then choose a 6-digit PIN. After
        that you only need the PIN.
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="label">Email</span>
          <input
            className="input h-9"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input
            className="input h-9"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t pt-4">
        <label className="block">
          <span className="label">New PIN</span>
          <input
            className="input h-9 text-center tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            placeholder="••••••"
            value={pin}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="label">Confirm PIN</span>
          <input
            className={`input h-9 text-center tracking-[0.4em] ${mismatch ? 'border-destructive' : ''}`}
            type="password"
            inputMode="numeric"
            placeholder="••••••"
            value={confirm}
            onChange={(e) => setConfirm(onlyDigits(e.target.value))}
          />
        </label>
      </div>

      {mismatch && <p className="text-xs text-destructive">PINs do not match.</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <button className="btn-primary btn-lg w-full" disabled={busy || !ready}>
        <KeyRound className="size-4" aria-hidden />
        {busy ? 'Setting up…' : 'Bind device & set PIN'}
      </button>
    </form>
  );
}

/** Daily unlock — 6-digit PIN restores the stored session. Type or click the keypad. */
function Unlock() {
  const { unlock, signOut, error, unlockFailure } = useAuth();
  const rejected = unlockFailure === 'rejected';
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(value: string) {
    if (value.length !== PIN_LEN || busy) return;
    setBusy(true);
    await unlock(value);
    setBusy(false);
    setPin('');
    inputRef.current?.focus();
  }

  function press(d: string) {
    const next = onlyDigits(pin + d);
    setPin(next);
    if (next.length === PIN_LEN) void submit(next);
  }

  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  return (
    <form
      className="card space-y-5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(pin);
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        className="sr-only"
        inputMode="numeric"
        autoFocus
        aria-label="PIN"
        value={pin}
        onChange={(e) => {
          const next = onlyDigits(e.target.value);
          setPin(next);
          if (next.length === PIN_LEN) void submit(next);
        }}
      />
      <PinBoxes value={pin} error={Boolean(error)} />

      {error && (
        <p role="alert" className="text-center text-xs text-destructive">
          {error}
        </p>
      )}
      {rejected && (
        <button
          type="button"
          className="btn-secondary h-10 w-full"
          onClick={(e) => {
            e.stopPropagation();
            void signOut();
          }}
        >
          Forget this device
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            className="btn-secondary h-11 text-base"
            onClick={() => press(d)}
            disabled={busy}
          >
            {d}
          </button>
        ))}
        <span />
        <button
          type="button"
          className="btn-secondary h-11 text-base"
          onClick={() => press('0')}
          disabled={busy}
        >
          0
        </button>
        <button
          type="button"
          className="btn-ghost h-11"
          aria-label="Delete last digit"
          onClick={() => setPin((p) => p.slice(0, -1))}
          disabled={busy || !pin}
        >
          <Delete className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex items-center justify-between border-t pt-4 text-xs">
        <span className="text-muted-foreground">
          {busy ? 'Unlocking…' : 'Locks after 15 min idle'}
        </span>
        {!rejected && (
          <button
            type="button"
            className="btn-ghost h-7 px-2 text-xs"
            onClick={() => void signOut()}
          >
            Forget this device
          </button>
        )}
      </div>
    </form>
  );
}
