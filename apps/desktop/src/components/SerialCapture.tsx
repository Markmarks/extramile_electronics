import { isValidImei } from '@extramile/core';
import { CheckCircle2, ScanLine } from 'lucide-react';
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
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {done ? 'All captured' : `Unit ${serials.length + 1} of ${count}`}
        </span>
        <span className="font-medium tabular-nums">
          {serials.length}/{count}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(serials.length / count) * 100}%` }}
        />
      </div>
      <form onSubmit={onSubmit} className="relative">
        <ScanLine
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          className={`input h-10 pl-8 font-mono ${error ? 'border-destructive' : ''}`}
          autoFocus
          disabled={done}
          placeholder="Scan or type IMEI, then Enter"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {serials.length > 0 && (
        <ol className="space-y-1">
          {serials.map((s, i) => (
            <li key={s} className="flex items-center gap-2 font-mono text-xs">
              <CheckCircle2 className="size-3.5 text-success" aria-hidden />
              <span className="text-muted-foreground">{i + 1}.</span> {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
