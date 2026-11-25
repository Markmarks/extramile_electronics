import { cedisToPesewas } from '@extramile/core';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** Centered dialog with a title bar; click outside or ✕ to close. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`card w-full shadow-xl ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h2 className="card-title">{title}</h2>
          <button
            type="button"
            className="btn-ghost h-7 w-7 px-0"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** Label + control stacked, used by every form in the back-office. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Cedis text from an input → integer pesewas, or null when blank / not a positive amount. */
export function cedisInputToPesewas(raw: string, allowZero = false): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) return null;
  return cedisToPesewas(n); // README rule 1: integer pesewas from here on
}

/** Pesewas → the "123.45" text an amount input shows. */
export function pesewasToInput(pesewas: number | null | undefined): string {
  return pesewas === null || pesewas === undefined ? '' : (pesewas / 100).toFixed(2);
}
