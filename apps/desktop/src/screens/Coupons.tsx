import { formatGHS } from '@extramile/core';
import { Pencil, Plus, TicketPercent } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cedisInputToPesewas, Field, Modal, pesewasToInput } from '../components/Modal';
import { EmptyState, Notice, PageHeader, StatusBadge } from '../components/ui';
import {
  couponState,
  createCoupon,
  KIND_LABELS,
  listCoupons,
  normalizeCode,
  updateCoupon,
  type Coupon,
  type CouponInput,
  type CouponKind,
} from '../lib/coupons';

function describe(c: Pick<Coupon, 'kind' | 'value'>): string {
  if (c.kind === 'percent') return `${c.value}% off`;
  if (c.kind === 'fixed') return `${formatGHS(c.value)} off`;
  return 'Free delivery';
}

/** Discount codes. Everyone sees them; only admins create or change them. */
export function Coupons({ isAdmin }: { isAdmin: boolean }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setCoupons(await listCoupons());
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save(input: CouponInput) {
    setMessage(null);
    try {
      if (editing === 'new') await createCoupon(input);
      else if (editing) {
        const { code: _code, ...rest } = input;
        await updateCoupon(editing.id, rest);
      }
      setEditing(null);
      setMessage({ tone: 'ok', text: `Coupon ${normalizeCode(input.code)} saved.` });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed.' });
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Coupons"
        subtitle="Codes customers enter at checkout"
        actions={
          isAdmin && (
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" aria-hidden /> New coupon
            </button>
          )
        }
      />
      {!isAdmin && (
        <div className="mb-3">
          <Notice tone="info">Only an admin can create or change coupons.</Notice>
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
        ) : coupons.length === 0 ? (
          <EmptyState icon={TicketPercent} title="No coupons yet" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th className="text-right">Min. order</th>
                <th className="text-right">Used</th>
                <th>Valid</th>
                <th>Status</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const state = couponState(c);
                return (
                  <tr key={c.id}>
                    <td className="font-mono text-xs font-semibold">{c.code}</td>
                    <td>{describe(c)}</td>
                    <td className="text-right tabular-nums">
                      {c.min_subtotal ? formatGHS(c.min_subtotal) : '—'}
                    </td>
                    <td className="text-right tabular-nums">
                      {c.redemption_count}
                      {c.max_redemptions !== null ? ` / ${c.max_redemptions}` : ''}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {c.starts_at ? new Date(c.starts_at).toLocaleDateString() : 'Any time'} →{' '}
                      {c.ends_at ? new Date(c.ends_at).toLocaleDateString() : 'no end'}
                    </td>
                    <td>
                      <StatusBadge value={state === 'live' ? 'active' : state} />
                    </td>
                    <td className="text-right">
                      {isAdmin && (
                        <button type="button" className="btn-ghost" onClick={() => setEditing(c)}>
                          <Pencil className="size-3.5" aria-hidden /> Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <Modal
          title={editing === 'new' ? 'New coupon' : `Edit ${editing.code}`}
          onClose={() => setEditing(null)}
        >
          <CouponForm coupon={editing === 'new' ? null : editing} onSave={(c) => void save(c)} />
        </Modal>
      )}
    </div>
  );
}

/** datetime-local value ↔ ISO string. */
const toLocal = (iso: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function CouponForm({
  coupon,
  onSave,
}: {
  coupon: Coupon | null;
  onSave: (c: CouponInput) => void;
}) {
  const [code, setCode] = useState(coupon?.code ?? '');
  const [kind, setKind] = useState<CouponKind>(coupon?.kind ?? 'percent');
  const [percent, setPercent] = useState(coupon?.kind === 'percent' ? String(coupon.value) : '10');
  const [amount, setAmount] = useState(
    coupon?.kind === 'fixed' ? pesewasToInput(coupon.value) : '',
  );
  const [minOrder, setMinOrder] = useState(pesewasToInput(coupon?.min_subtotal ?? 0));
  const [maxUses, setMaxUses] = useState(
    coupon?.max_redemptions ? String(coupon.max_redemptions) : '',
  );
  const [starts, setStarts] = useState(toLocal(coupon?.starts_at ?? null));
  const [ends, setEnds] = useState(toLocal(coupon?.ends_at ?? null));
  const [active, setActive] = useState(coupon?.is_active ?? true);

  const pct = Number(percent);
  const amountP = cedisInputToPesewas(amount);
  const minP = cedisInputToPesewas(minOrder, true);
  const maxN = maxUses.trim() ? Number(maxUses) : null;
  const value = kind === 'percent' ? pct : kind === 'fixed' ? amountP : 0;
  const errors = [
    !coupon &&
      !/^[A-Z0-9_-]{3,40}$/.test(normalizeCode(code)) &&
      'Code: 3–40 letters, numbers, - or _.',
    kind === 'percent' && !(Number.isInteger(pct) && pct >= 1 && pct <= 100) && 'Percent: 1–100.',
    kind === 'fixed' && amountP === null && 'Enter the amount off.',
    minP === null && 'Minimum order: 0 or more.',
    maxN !== null && !(Number.isInteger(maxN) && maxN >= 1) && 'Total uses: 1 or more, or blank.',
    starts && ends && new Date(ends) <= new Date(starts) && 'End must be after start.',
  ].filter(Boolean) as string[];

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (errors.length || value === null || minP === null) return;
        onSave({
          code: coupon?.code ?? normalizeCode(code),
          kind,
          value,
          min_subtotal: minP,
          max_redemptions: maxN,
          per_user_limit: coupon?.per_user_limit ?? 1,
          starts_at: fromLocal(starts),
          ends_at: fromLocal(ends),
          is_active: active,
        });
      }}
    >
      <Field
        label="Code"
        hint={
          coupon
            ? 'Codes can’t be changed once created — make a new coupon instead.'
            : 'What customers type, e.g. EASTER10.'
        }
      >
        <input
          className="input font-mono uppercase"
          value={coupon?.code ?? code}
          disabled={!!coupon}
          maxLength={40}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <Field label="Discount">
        <div className="inline-flex rounded-lg border bg-secondary/50 p-0.5" role="radiogroup">
          {(Object.keys(KIND_LABELS) as CouponKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${kind === k ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </Field>
      {kind === 'percent' && (
        <Field label="Percent off">
          <input
            className="input"
            type="number"
            min={1}
            max={100}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </Field>
      )}
      {kind === 'fixed' && (
        <Field label="Amount off (GH₵)" hint="Never more than the order’s items total.">
          <input
            className="input"
            type="number"
            min={0.01}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Minimum order (GH₵)" hint="0 = any order">
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
          />
        </Field>
        <Field label="Total uses allowed" hint="Blank = unlimited">
          <input
            className="input"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </Field>
        <Field label="Starts" hint="Blank = now">
          <input
            className="input"
            type="datetime-local"
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
          />
        </Field>
        <Field label="Ends" hint="Blank = no end">
          <input
            className="input"
            type="datetime-local"
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Switched on
      </label>
      {errors.length > 0 && <Notice tone="error">{errors[0]}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={errors.length > 0}>
          Save coupon
        </button>
      </div>
    </form>
  );
}
