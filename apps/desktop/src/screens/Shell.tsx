import {
  Boxes,
  KeyRound,
  LayoutDashboard,
  Lock,
  type LucideIcon,
  Package,
  ShoppingBag,
  Users as UsersIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ChangePasswordDialog } from '../components/ChangePasswordDialog';
import { OfflineBanner } from '../components/OfflineBanner';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { isPreview } from '../lib/preview';
import { Catalogue } from './Catalogue';
import { Dashboard } from './Dashboard';
import { Inventory } from './Inventory';
import { Orders } from './Orders';
import { Users } from './Users';

export type View = 'home' | 'orders' | 'catalogue' | 'inventory' | 'users';

export function Shell() {
  const { user, role: authRole, lock } = useAuth();
  const role = authRole ?? (isPreview ? 'admin' : null);
  const { online, lastSync } = useOfflineSync(true);
  const [view, setView] = useState<View>('home');
  const [changePw, setChangePw] = useState(false);

  const nav: { id: View; label: string; icon: LucideIcon }[] = [
    { id: 'home', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'catalogue', label: 'Catalogue', icon: Package },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    ...(role === 'admin' ? [{ id: 'users' as const, label: 'Users', icon: UsersIcon }] : []),
  ];
  const email = user?.email ?? (isPreview ? 'preview@extramile.local' : '');

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background">
            E
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold">ExtraMile</p>
            <p className="text-[11px] text-muted-foreground">Back-office</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {nav.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
              {(email || '?').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-medium">{email}</p>
              <p className="flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground">
                <span
                  className={`size-1.5 rounded-full ${online ? 'bg-success' : 'bg-amber-500'}`}
                  aria-hidden
                />
                {role ?? 'unknown'} · {online ? 'online' : 'offline'}
              </p>
            </div>
          </div>
          {(user || isPreview) && (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => setChangePw(true)}
            >
              <KeyRound className="size-3.5" aria-hidden /> Change password
            </button>
          )}
          <button type="button" className="btn-secondary w-full" onClick={lock}>
            <Lock className="size-3.5" aria-hidden /> Lock
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner online={online} lastSync={lastSync} />
        {isPreview && (
          <p className="border-b bg-amber-500/10 px-6 py-1.5 text-xs text-amber-700">
            Design preview — not signed in, so only public data loads.
          </p>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {view === 'home' && <Dashboard onNavigate={setView} />}
          {view === 'orders' && <Orders />}
          {view === 'catalogue' && <Catalogue />}
          {view === 'inventory' && <Inventory />}
          {view === 'users' && role === 'admin' && <Users />}
        </main>
      </div>

      {changePw && <ChangePasswordDialog onClose={() => setChangePw(false)} />}
    </div>
  );
}
