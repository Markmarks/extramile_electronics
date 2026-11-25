-- Migration 20261124000005 — checkout: let create_order find pgcrypto.
--
-- On Supabase, pgcrypto is installed in the `extensions` schema. create_order (007) is
-- pinned to `search_path = public`, so its order-number line —
-- gen_random_bytes(3) — raised "function gen_random_bytes(integer) does not exist" and
-- every checkout failed before an order was written. Found 2026-11-24 by exercising the
-- live database; reproduced in apps/web/tests/db (harness mirrors this layout).
-- Keep `public` first so table names resolve exactly as before.
-- Rollback: alter function ... set search_path = public;

alter function public.create_order(uuid, text, text, jsonb, uuid, text, uuid)
  set search_path = public, extensions;
