-- Migration 20261124000001 — API role grants.
-- Applied to the hosted project on 2026-11-24 outside the repo; this file reconstructs it
-- from the live privileges so a rebuilt database matches production. Idempotent.
--
-- New Supabase projects no longer give the API roles write privileges by default. RLS
-- still decides which rows a role may touch; these grants decide whether it may try.
--   anon          → read only (RLS limits it to the public catalogue)
--   authenticated → read/write, filtered by RLS (customers: own rows; staff: is_staff())
-- Rollback: revoke the grants below.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
