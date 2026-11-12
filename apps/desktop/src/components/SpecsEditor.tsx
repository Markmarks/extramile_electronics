import { specFields, specKey, specLabel, type SpecType, type SpecValue } from '@extramile/core';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { Specs } from '../lib/catalogue';

/** Drop empty values so the storefront never shows blank rows. */
export function cleanSpecs(specs: Specs): Specs {
  return Object.fromEntries(
    Object.entries(specs).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  );
}

function coerce(type: SpecType, raw: string): SpecValue | '' {
  if (raw === '') return '';
  if (type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (type === 'boolean') return raw === 'true';
  return raw;
}

/**
 * Edit a product's tech specs. Fields the category's spec_schema expects come first,
 * typed (number / text / yes-no); staff can add any extra spec as a free label + value.
 */
export function SpecsEditor({
  schema,
  value,
  onChange,
}: {
  schema: Record<string, unknown>;
  value: Specs;
  onChange: (next: Specs) => void;
}) {
  const fields = specFields(schema);
  const known = new Set(fields.map((f) => f.key));
  const extras = Object.keys(value).filter((k) => !known.has(k));
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');

  function set(key: string, v: SpecValue | '') {
    const next = { ...value };
    if (v === '') delete next[key];
    else next[key] = v;
    onChange(next);
  }

  function addExtra() {
    const key = specKey(newLabel);
    if (!key || !newValue.trim()) return;
    set(key, newValue.trim());
    setNewLabel('');
    setNewValue('');
  }

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
          {fields.map((f) => {
            const current = value[f.key];
            return (
              <label key={f.key} className="block">
                <span className="label">{specLabel(f.key)}</span>
                {f.type === 'boolean' ? (
                  <select
                    className="input"
                    value={current === undefined ? '' : String(current)}
                    onChange={(e) => set(f.key, coerce('boolean', e.target.value))}
                  >
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    className="input"
                    type={f.type === 'number' ? 'number' : 'text'}
                    step="any"
                    value={current === undefined ? '' : String(current)}
                    onChange={(e) => set(f.key, coerce(f.type, e.target.value))}
                  />
                )}
              </label>
            );
          })}
        </div>
      )}

      {extras.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="label">Extra specs</p>
          {extras.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-xs font-medium" title={k}>
                {specLabel(k)}
              </span>
              <input
                className="input"
                value={String(value[k])}
                onChange={(e) => set(k, e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost h-8 w-8 shrink-0 px-0"
                aria-label={`Remove ${specLabel(k)}`}
                onClick={() => set(k, '')}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 border-t pt-3">
        <label className="w-40 shrink-0">
          <span className="label">Add a spec</span>
          <input
            className="input"
            placeholder="e.g. Refresh rate"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
        </label>
        <label className="flex-1">
          <span className="label">Value</span>
          <input
            className="input"
            placeholder="e.g. 120 Hz"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addExtra();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn-secondary shrink-0"
          disabled={!specKey(newLabel) || !newValue.trim()}
          onClick={addExtra}
        >
          <Plus className="size-3.5" aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}
