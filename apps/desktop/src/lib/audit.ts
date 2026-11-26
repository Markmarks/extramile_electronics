import { supabase } from './supabase';

/** One audit_log row (staff-readable since migration 20261126000003). */
export interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  source: string;
  device_id: string | null;
  created_at: string;
  actor: string | null;
  actor_name: string | null;
  after: Record<string, unknown> | null;
}

export interface AuditFilter {
  source?: 'web' | 'desktop' | 'system' | '';
  /** Substring of the action, e.g. "refund" or "denied". */
  action?: string;
  /** ISO date (yyyy-mm-dd), inclusive. */
  from?: string;
  to?: string;
}

/** Newest first. Actions are free text, so the search is a safe ilike on a cleaned term. */
export async function listAudit(f: AuditFilter, limit = 200): Promise<AuditEntry[]> {
  let q = supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, source, device_id, created_at, actor, after')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (f.source) q = q.eq('source', f.source);
  const term = (f.action ?? '').trim().replace(/[%_,()\\]/g, '');
  if (term) q = q.ilike('action', `%${term}%`);
  if (f.from) q = q.gte('created_at', `${f.from}T00:00:00`);
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59.999`);

  const { data } = await q.returns<Omit<AuditEntry, 'actor_name'>[]>();
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.actor).filter((a): a is string => !!a))];
  const names = new Map<string, string | null>();
  if (ids.length) {
    const { data: people } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
      .returns<{ id: string; full_name: string | null }[]>();
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }
  return rows.map((r) => ({ ...r, actor_name: r.actor ? (names.get(r.actor) ?? null) : null }));
}

/** "admin_actions.order_transition" → "Order transition"; denied attempts are flagged. */
export function describeAction(action: string): { label: string; denied: boolean } {
  const denied = action.includes('.denied.') || action.includes('.revoked_device.');
  const last = action.split('.').pop() ?? action;
  const label = last.replace(/_/g, ' ');
  return { label: label.charAt(0).toUpperCase() + label.slice(1), denied };
}
