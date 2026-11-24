-- Migration 012 — lock down privileged RPCs
--
-- SECURITY ISSUE this closes:
-- PostgreSQL grants EXECUTE on every newly created function to the PUBLIC role by default,
-- and migrations 001–011 never revoke it. create_order and commit_paid_order (migration 007)
-- are SECURITY DEFINER (they run as `postgres` and bypass RLS) and are documented as
-- "Called from trusted server code only" / commit "after verified payment" — yet PUBLIC
-- (hence anon) could call them directly over PostgREST. commit_paid_order does NOT verify
-- payment itself; it trusts the caller. So an unauthenticated user could call create_order
-- to mint an order and then commit_paid_order to mark it paid/confirmed and commit stock,
-- WITHOUT paying — a checkout/payment bypass. release_expired_reservations and
-- handle_new_user are likewise internal-only.
--
-- Fix: restrict these to service_role (how trusted server code, the Paystack webhook, and
-- pg_cron already invoke them). pg_cron jobs run as the scheduling role (not anon) and
-- triggers run as the function owner, so the cron reservation-release and the new-user
-- trigger are unaffected.
--
-- Deliberately NOT restricted:
--   • public.is_staff()        — evaluated inside RLS policies; the querying role (anon/
--                                authenticated) must retain EXECUTE or policies break.
--   • public.search_products() — SECURITY INVOKER, explicitly granted to anon/authenticated
--                                in migration 009; gated by table grants + RLS.
--
-- Rollback: `grant execute on function <sig> to public;` for each (not recommended).

revoke execute on function public.create_order(uuid, text, text, jsonb, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.commit_paid_order(uuid)
  from public, anon, authenticated;
revoke execute on function public.release_expired_reservations()
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
