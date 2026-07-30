import { isValidImei } from '@extramile/core';
import { useState, type FormEvent } from 'react';

/**
 * Scan-to-capture IMEI/serials, one per unit (docs/07 §6). HID keyboard-emulating
 * scanners type the code then send Enter, which submits the form. Each scan is
 * Luhn-validated; progress shows "n of total".
 */
export function SerialCapture({
  count,
  onComplete,
}: {
  count: number;
  onComplete: (serials: string[]) => void;
}) {
  const [serials, setSerials] = useState<string[]>([]);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const s = value.trim();
    if (!isValidImei(s)) {
      setError('Not a valid 15-digit IMEI.');
      return;
    }
    if (serials.includes(s)) {
      setError('Already captured.');
      return;
    }
    const next = [...serials, s];
    setSerials(next);
    setValue('');
    setError(null);
    if (next.length >= count) onComplete(next);
  }

  const done = serials.length >= count;

  return (
    <div className="card" style={{ maxWidth: '28rem' }}>
      <p className="muted">
        Scan serial {Math.min(serials.length + 1, count)} of {count}
      </p>
      <form onSubmit={onSubmit}>
        <input
          className="input"
          autoFocus
          disabled={done}
          placeholder="Scan or type IMEI"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
      </form>
      {error && <p className="error">{error}</p>}
      <ol className="muted" style={{ margin: 0, paddingLeft: '1.2rem' }}>
        {serials.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {done && <p style={{ color: 'hsl(var(--success))' }}>All {count} captured.</p>}
    </div>
  );
}
