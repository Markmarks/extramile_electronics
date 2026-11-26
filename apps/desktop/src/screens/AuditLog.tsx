import { RefreshCw, ScrollText, ShieldAlert } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { EmptyState, PageHeader, StatusBadge } from '../components/ui';
import { describeAction, listAudit, type AuditEntry, type AuditFilter } from '../lib/audit';

/** Who did what, from which app and PC (docs/07 §4 Audit log). Read-only. */
export function AuditLog() {
  const [filter, setFilter] = useState<AuditFilter>({ source: '', action: '' });
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async (f: AuditFilter) => {
    setLoading(true);
    setRows(await listAudit(f).catch(() => []));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load({});
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Audit log"
        subtitle="Every privileged action, with who, where and when"
        actions={
          <button type="button" className="btn-secondary" onClick={() => void load(filter)}>
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </button>
        }
      />

      <form
        className="card flex flex-wrap items-end gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load(filter);
        }}
      >
        <label className="space-y-1">
          <span className="label">Source</span>
          <select
            className="input w-32"
            value={filter.source}
            onChange={(e) =>
              setFilter({ ...filter, source: e.target.value as AuditFilter['source'] })
            }
          >
            <option value="">All</option>
            <option value="desktop">Desktop</option>
            <option value="web">Web</option>
            <option value="system">System</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="label">Action contains</span>
          <input
            className="input w-48"
            placeholder="refund, denied…"
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span className="label">From</span>
          <input
            type="date"
            className="input"
            value={filter.from ?? ''}
            onChange={(e) => setFilter({ ...filter, from: e.target.value || undefined })}
          />
        </label>
        <label className="space-y-1">
          <span className="label">To</span>
          <input
            type="date"
            className="input"
            value={filter.to ?? ''}
            onChange={(e) => setFilter({ ...filter, to: e.target.value || undefined })}
          />
        </label>
        <button type="submit" className="btn-primary">
          Filter
        </button>
      </form>

      <section className="card overflow-hidden">
        {loading ? (
          <p className="px-4 py-8 text-center text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No entries"
            body="Nothing matches these filters (or you are not signed in)."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>By</th>
                <th>Source</th>
                <th>Device</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = describeAction(r.action);
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="cursor-pointer hover:bg-secondary/40"
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                    >
                      <td className="whitespace-nowrap text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className={a.denied ? 'text-destructive' : 'font-medium'}>
                        {a.denied && (
                          <ShieldAlert className="mr-1 inline size-3.5" aria-label="Refused" />
                        )}
                        {a.label}
                      </td>
                      <td>{r.actor_name ?? (r.actor ? `${r.actor.slice(0, 8)}…` : 'system')}</td>
                      <td>
                        <StatusBadge value={r.source} />
                      </td>
                      <td className="font-mono text-[11px] text-muted-foreground">
                        {r.device_id ? `${r.device_id.slice(0, 12)}…` : '—'}
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td colSpan={5} className="bg-secondary/30">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                            {JSON.stringify({ action: r.action, ...r.after }, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
