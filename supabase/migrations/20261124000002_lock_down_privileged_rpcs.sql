-- Migration 20261124000002 — lock down privileged RPCs.
-- Applied to the hosted project on 2026-11-24 outside the repo; reconstructed from the
-- live function ACLs. Idempotent.
--
-- These SECURITY DEFINER functions bypass RLS, so they must only run from trusted server
-- code (Next.js route handlers / Edge Functions using service_role), never straight from
-- a browser via PostgREST. Functions are executable by PUBLIC by default — revoke that.
-- search_products and is_staff stay public (catalogue search; RLS helper).
-- Rollback: grant execute on the functions below to anon, authenticated.

revoke execute on function public.create_order(uuid, text, text, jsonb, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.commit_paid_order(uuid) from public, anon, authenticated;
revoke execute on function public.release_expired_reservations() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.create_order(uuid, text, text, jsonb, uuid, text, uuid) to service_role;
grant execute on function public.commit_paid_order(uuid) to service_role;
grant execute on function public.release_expired_reservations() to service_role;
grant execute on function public.handle_new_user() to service_role;
