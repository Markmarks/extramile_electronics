-- Authoritative "RLS enabled on every public table" check.
-- Test S-12 / launch checklist (docs/03-SDLC.md §5). MUST return 0 rows.
-- Run: supabase db execute --file scripts/check-rls.sql  (or psql -f)
select relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by relname;
