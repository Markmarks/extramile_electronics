import { formatGHS } from '@extramile/core';
import { MailX, Search, Trash2, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Field } from '../components/Modal';
import { EmptyState, Notice, PageHeader, StatusBadge } from '../components/ui';
import {
  addSuppression,
  listCustomerOrders,
  listCustomers,
  listSuppressions,
  removeSuppression,
  type CustomerOrder,
  type CustomerRow,
  type Suppression,
} from '../lib/customers';

type Tab = 'customers' | 'optouts';

export function Customers({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>('customers');
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <PageHeader
        title="Customers"
        subtitle="Accounts, their orders, and addresses the shop must not email"
        actions={
          <div className="inline-flex rounded-lg border bg-secondary/50 p-0.5">
            {(
              [
                ['customers', 'Customers'],
                ['optouts', 'Email opt-outs'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  tab === id ? 'bg-card shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      {tab === 'customers' ? <CustomerList /> : <OptOuts isAdmin={isAdmin} />}
    </div>
  );
}

function CustomerList() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setRows(await listCustomers(term));
    setLoading(false);
  }, []);
  useEffect(() => {
    void load('');
  }, [load]);

  async function open(c: CustomerRow) {
    setSelected(c);
    setOrders(await listCustomerOrders(c.id));
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[24rem_1fr]">
      <section className="card flex min-h-0 flex-col overflow-hidden">
        <form
          className="relative border-b p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q);
          }}
        >
          <Search
            className="pointer-events-none absolute left-4.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            className="input pl-8"
            placeholder="Search name or phone, then Enter"
            aria-label="Search customers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {loading ? (
            <li className="px-4 py-8 text-center text-muted-foreground">Loading…</li>
          ) : rows.length === 0 ? (
            <li>
              <EmptyState icon={UserRound} title="No customers found" />
            </li>
          ) : (
            rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void open(c)}
                  className={`flex w-full items-center justify-between gap-3 border-l-2 px-4 py-2.5 text-left ${
                    selected?.id === c.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-secondary/50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.full_name || 'No name'}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.email ?? c.phone ?? 'No contact yet'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                    {c.orders} order{c.orders === 1 ? '' : 's'}
                    <span className="block font-medium tabular-nums text-foreground">
                      {formatGHS(c.spent)}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="card min-h-0 overflow-y-auto">
        {!selected ? (
          <EmptyState
            icon={UserRound}
            title="No customer selected"
            body="Pick one to see their orders."
          />
        ) : (
          <div>
            <div className="border-b p-5">
              <p className="text-lg font-semibold">{selected.full_name || 'No name'}</p>
              <p className="mt-0.5 text-muted-foreground">
                {[selected.email, selected.phone].filter(Boolean).join(' · ') ||
                  'No contact details'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Customer since {new Date(selected.created_at).toLocaleDateString()} · marketing
                emails {selected.marketing_opt_in ? 'allowed' : 'not allowed'}
              </p>
            </div>
            {orders.length === 0 ? (
              <EmptyState icon={UserRound} title="No orders yet" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="font-medium">{o.order_number}</td>
                      <td className="text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <StatusBadge value={o.status} />
                      </td>
                      <td>
                        <StatusBadge value={o.payment_status} />
                      </td>
                      <td className="text-right tabular-nums">{formatGHS(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t px-5 py-3 text-xs text-muted-foreground">
              To pack, refund or reprint one of these, find it by number on the Orders screen.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function OptOuts({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Suppression[]>([]);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = useCallback(async () => setRows(await listSuppressions()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(fn: () => Promise<void>, ok: string) {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'ok', text: ok });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed.' });
    }
  }

  return (
    <div className="max-w-3xl space-y-3">
      <Notice tone="info">
        The shop never emails these addresses (bounced mail, spam complaints, unsubscribes).
        {isAdmin
          ? ' Only lift one if the customer asked to receive email again.'
          : ' Only an admin can change this list.'}
      </Notice>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {isAdmin && (
        <form
          className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) return;
            void run(async () => {
              await addSuppression(email, reason);
              setEmail('');
              setReason('');
            }, 'Added. That address will get no more emails.');
          }}
        >
          <Field label="Email address">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <input
              className="input"
              placeholder="e.g. Asked by phone"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button className="btn-secondary" disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>
            <MailX className="size-3.5" aria-hidden /> Stop emails
          </button>
        </form>
      )}
      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={MailX} title="No opt-outs" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Reason</th>
                <th>Since</th>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.email}>
                  <td className="font-medium">{s.email}</td>
                  <td className="text-muted-foreground">{s.reason ?? '—'}</td>
                  <td className="text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    {isAdmin &&
                      (confirming === s.email ? (
                        <button
                          type="button"
                          className="btn-secondary text-destructive"
                          onClick={() => {
                            setConfirming(null);
                            void run(
                              () => removeSuppression(s.email),
                              `${s.email} can receive emails again.`,
                            );
                          }}
                        >
                          Yes, allow emails
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setConfirming(s.email)}
                        >
                          <Trash2 className="size-3.5" aria-hidden /> Lift
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
