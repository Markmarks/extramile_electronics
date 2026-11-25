import { Laptop, Search, UserPlus, Users as UsersIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState, Notice, PageHeader, StatusBadge } from '../components/ui';
import {
  changeRole,
  inviteStaff,
  listDevices,
  listUsers,
  ROLES,
  setDeviceRevoked,
  type DeviceRow,
  type Role,
  type UserRow,
} from '../lib/users';

/** User management — admin only (role_change / staff_invite are admin-only server-side). */
export function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [devices, setDevices] = useState<DeviceRow[]>([]);

  const refresh = useCallback(async () => {
    const [u, d] = await Promise.all([listUsers(), listDevices()]);
    setUsers(u);
    setDevices(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const report = (fn: () => Promise<void>, ok: string) => async () => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'ok', text: ok });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed.' });
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (roleFilter === 'all' || u.role === roleFilter) &&
        (!q || (u.full_name ?? '').toLowerCase().includes(q) || (u.phone ?? '').includes(q)),
    );
  }, [users, query, roleFilter]);

  const counts = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, users.filter((u) => u.role === r).length])),
    [users],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Users"
        subtitle={`${counts.admin ?? 0} admin · ${counts.staff ?? 0} staff · ${counts.customer ?? 0} customers`}
      />

      <InviteForm
        onInvite={(email, role) =>
          report(() => inviteStaff(email, role), `Invitation sent to ${email}.`)()
        }
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <section className="card overflow-hidden">
        <div className="card-header">
          <div className="flex gap-1">
            {(['all', ...ROLES] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  roleFilter === r
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="relative w-56">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              className="input pl-8"
              placeholder="Search name or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-muted-foreground">Loading…</p>
        ) : shown.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users match" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Phone</th>
                <th>Joined</th>
                <th>Role</th>
                <th className="w-36">Change role</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                        {(u.full_name || '?').charAt(0).toUpperCase()}
                      </span>
                      {u.full_name || <span className="text-muted-foreground">Unnamed</span>}
                    </div>
                  </td>
                  <td className="text-muted-foreground">{u.phone ?? '—'}</td>
                  <td className="text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <StatusBadge value={u.role} />
                  </td>
                  <td>
                    <select
                      className="input"
                      value={u.role}
                      onChange={(e) =>
                        report(() => changeRole(u.id, e.target.value as Role), 'Role updated.')()
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <DevicesPanel
        devices={devices}
        onToggle={(d) =>
          report(
            () => setDeviceRevoked(d.device_id, !d.is_revoked),
            d.is_revoked
              ? 'Device restored.'
              : 'Device revoked — it is locked out at its next unlock.',
          )()
        }
      />
    </div>
  );
}

/** Back-office PCs that have signed in. Revoke a lost or stolen one. */
function DevicesPanel({
  devices,
  onToggle,
}: {
  devices: DeviceRow[];
  onToggle: (d: DeviceRow) => void;
}) {
  return (
    <section className="card overflow-hidden" aria-label="Back-office devices">
      <div className="card-header">
        <div>
          <h2 className="text-sm font-semibold">Back-office devices</h2>
          <p className="text-xs text-muted-foreground">
            Revoke a lost or stolen PC: privileged actions stop immediately and it is wiped at its
            next unlock.
          </p>
        </div>
      </div>
      {devices.length === 0 ? (
        <EmptyState icon={Laptop} title="No devices registered yet" />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Last user</th>
              <th>Last seen</th>
              <th>Status</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.device_id}>
                <td>
                  <div className="leading-tight">
                    <p>{d.label ?? 'Back-office'}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.os ?? '—'} · v{d.app_version ?? '?'} · {d.device_id.slice(0, 8)}
                    </p>
                  </div>
                </td>
                <td className="text-muted-foreground">{d.profiles?.full_name ?? '—'}</td>
                <td className="text-muted-foreground">
                  {new Date(d.last_seen_at).toLocaleString()}
                </td>
                <td>
                  <StatusBadge value={d.is_revoked ? 'revoked' : 'active'} />
                </td>
                <td>
                  <button
                    type="button"
                    className={d.is_revoked ? 'btn-secondary w-full' : 'btn-danger w-full'}
                    onClick={() => onToggle(d)}
                  >
                    {d.is_revoked ? 'Restore' : 'Revoke'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function InviteForm({ onInvite }: { onInvite: (email: string, role: Role) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    onInvite(email.trim(), role);
    setEmail('');
  }

  return (
    <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={submit}>
      <label className="min-w-[16rem] flex-1">
        <span className="label">Invite staff by email</span>
        <input
          className="input"
          type="email"
          placeholder="new.staff@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="w-32">
        <span className="label">Role</span>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button className="btn-primary" disabled={!email.trim()}>
        <UserPlus className="size-3.5" aria-hidden /> Send invite
      </button>
    </form>
  );
}
