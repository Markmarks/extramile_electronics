import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin' };

/**
 * Read-only ops dashboard (docs/07-DESKTOP-ADMIN.md §2 — full CRUD lives in the
 * desktop app). Guarded by middleware (non-staff get 404) AND RLS. Built out in P9.
 */
export default function AdminDashboardPage() {
  return (
    <main className="container space-y-2 py-12">
      <h1 className="text-2xl font-semibold">Ops dashboard</h1>
      <p className="text-sm text-muted-foreground">
        Staff-only. Today&apos;s orders, revenue and low-stock land here in phase P9.
      </p>
    </main>
  );
}
