import { formatGHS } from '@extramile/core';
import { Pencil, Plus, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cedisInputToPesewas, Field, Modal, pesewasToInput } from '../components/Modal';
import { EmptyState, Notice, PageHeader, StatusBadge } from '../components/ui';
import { createZone, listZones, updateZone, type Zone, type ZoneInput } from '../lib/delivery';

/** Delivery zones and fees. Everyone sees them; only admins can change them. */
export function Delivery({ isAdmin }: { isAdmin: boolean }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Zone | 'new' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setZones(await listZones());
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save(input: ZoneInput) {
    setMessage(null);
    try {
      if (editing === 'new') await createZone(input);
      else if (editing) await updateZone(editing.id, input);
      setEditing(null);
      setMessage({
        tone: 'ok',
        text: `“${input.name}” saved. New checkouts use it straight away.`,
      });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed.' });
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Delivery"
        subtitle="Zones customers choose at checkout, with their fee and delivery time"
        actions={
          isAdmin && (
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" aria-hidden /> New zone
            </button>
          )
        }
      />
      {!isAdmin && (
        <div className="mb-3">
          <Notice tone="info">Only an admin can change delivery zones and fees.</Notice>
        </div>
      )}
      {message && (
        <div className="mb-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      <section className="card overflow-hidden">
        {loading ? (
          <p className="px-4 py-8 text-center text-muted-foreground">Loading…</p>
        ) : zones.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No delivery zones"
            body="Add one so customers can check out."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Zone</th>
                <th className="text-right">Fee</th>
                <th className="text-right">Free from</th>
                <th className="text-right">Delivery time</th>
                <th>Status</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className={z.is_active ? '' : 'opacity-60'}>
                  <td className="font-medium">{z.name}</td>
                  <td className="text-right tabular-nums">
                    {z.base_fee ? formatGHS(z.base_fee) : 'Free'}
                  </td>
                  <td className="text-right tabular-nums">
                    {z.free_over ? formatGHS(z.free_over) : '—'}
                  </td>
                  <td className="text-right tabular-nums">
                    {z.eta_days_min === z.eta_days_max
                      ? `${z.eta_days_min} day${z.eta_days_min === 1 ? '' : 's'}`
                      : `${z.eta_days_min}–${z.eta_days_max} days`}
                  </td>
                  <td>
                    <StatusBadge value={z.is_active ? 'active' : 'off'} />
                  </td>
                  <td className="text-right">
                    {isAdmin && (
                      <button type="button" className="btn-ghost" onClick={() => setEditing(z)}>
                        <Pencil className="size-3.5" aria-hidden /> Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        Fees apply to new orders only; orders already placed keep the fee they were charged. Zones
        can’t be deleted because past orders refer to them — switch one off instead.
      </p>

      {editing && (
        <Modal
          title={editing === 'new' ? 'New delivery zone' : `Edit “${editing.name}”`}
          onClose={() => setEditing(null)}
        >
          <ZoneForm zone={editing === 'new' ? null : editing} onSave={(z) => void save(z)} />
        </Modal>
      )}
    </div>
  );
}

function ZoneForm({ zone, onSave }: { zone: Zone | null; onSave: (z: ZoneInput) => void }) {
  const [name, setName] = useState(zone?.name ?? '');
  const [fee, setFee] = useState(pesewasToInput(zone?.base_fee ?? 0));
  const [freeOver, setFreeOver] = useState(pesewasToInput(zone?.free_over));
  const [min, setMin] = useState(String(zone?.eta_days_min ?? 1));
  const [max, setMax] = useState(String(zone?.eta_days_max ?? 2));
  const [active, setActive] = useState(zone?.is_active ?? true);

  const feeP = fee.trim() === '' ? null : cedisInputToPesewas(fee, true);
  const freeP = freeOver.trim() === '' ? null : cedisInputToPesewas(freeOver);
  const minN = Number(min);
  const maxN = Number(max);
  const errors = [
    !name.trim() && 'Enter a name.',
    feeP === null && 'Enter a fee (0 for free).',
    freeOver.trim() !== '' && freeP === null && 'Free-delivery threshold must be above 0.',
    !(Number.isInteger(minN) && minN >= 0 && Number.isInteger(maxN) && maxN >= minN) &&
      'Days must be whole numbers, latest ≥ earliest.',
  ].filter(Boolean) as string[];

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (errors.length || feeP === null) return;
        onSave({
          name: name.trim(),
          base_fee: feeP,
          free_over: freeP,
          eta_days_min: minN,
          eta_days_max: maxN,
          is_active: active,
        });
      }}
    >
      <Field label="Name" hint="What customers see, e.g. “Anywhere in Accra”.">
        <input
          className="input"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Delivery fee (GH₵)" hint="0 = free">
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </Field>
        <Field label="Free when the order is over (GH₵)" hint="Leave blank for never">
          <input
            className="input"
            type="number"
            min={0.01}
            step="0.01"
            value={freeOver}
            onChange={(e) => setFreeOver(e.target.value)}
          />
        </Field>
        <Field label="Earliest delivery (days)">
          <input
            className="input"
            type="number"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </Field>
        <Field label="Latest delivery (days)">
          <input
            className="input"
            type="number"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Customers can choose this zone at checkout
      </label>
      {errors.length > 0 && <Notice tone="error">{errors[0]}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={errors.length > 0}>
          Save zone
        </button>
      </div>
    </form>
  );
}
