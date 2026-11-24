-- Migration 011 — API role grants
--
-- Why this exists:
-- Migrations 001–010 create every object as the `postgres` role but issue almost no
-- table/sequence GRANTs, relying on Supabase's *standard* default privileges to make
-- the catalogue/orders tables reachable through PostgREST (with RLS doing the row-level
-- gating). On this project the default privileges for role `postgres` in schema `public`
-- have SELECT/INSERT/UPDATE/DELETE revoked for the API roles, so freshly created tables
-- land unreachable — every role (anon, authenticated, AND service_role) gets `42501
-- permission denied` from the REST API. RLS is enabled on all 20 tables (migration 006)
-- and REMAINS the security gate; the grants below only restore table/sequence *access*,
-- which the existing policies then filter.
--
-- Posture (intentionally conservative, matches the policies in migration 006):
--   • anon          → SELECT only  (public catalogue reads; no anon write policy exists)
--   • authenticated → SELECT + INSERT + UPDATE + DELETE  (own-data / staff policies gate rows;
--                     tables with no policy, e.g. webhook_events/audit_log/refunds, stay fully
--                     denied by RLS even with the grant)
--   • service_role  → ALL  (trusted server key; bypasses RLS; runs webhooks/fulfilment)
--
-- Functions are deliberately left deny-by-default (only `search_products` is granted, in
-- migration 009). We do NOT broaden EXECUTE to anon/authenticated here — doing so could
-- expose privileged RPCs. service_role is granted EXECUTE so server-side code can call RPCs.
--
-- Rollback: revoke the grants below and reset the altered default privileges.

grant usage on schema public to anon, authenticated, service_role;

-- ── Existing objects ────────────────────────────────────────────────────────
grant select                         on all tables    in schema public to anon;
grant select, insert, update, delete on all tables    in schema public to authenticated;
grant all                            on all tables    in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on all functions in schema public to service_role;

-- ── Future objects created by `postgres` (so later migrations don't regress) ──
alter default privileges for role postgres in schema public
  grant select on tables to anon;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
