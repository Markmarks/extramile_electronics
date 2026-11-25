-- Seed data for local/preview databases.
--
-- The catalogue (5 categories, 8 brands, 30 products with variants, images, 4 shipping
-- zones, 2 coupons) is seeded by migration 20260730120000_seed_catalogue.sql, which
-- `supabase db reset` applies before this file — so it exists in every environment,
-- production included, and is guarded to run only on an empty catalogue.
--
-- This file used to repeat that data. The copy had drifted: on a fresh reset it failed
-- on categories_slug_key (duplicates of the migration's rows), and its Televisions
-- insert was missing its `) as v(...)` alias and joins, a syntax error that the
-- duplicate-key failure had been hiding. Both were found by the first real CI run on
-- 2026-11-24. Keep seed data in one place: the migration.
--
-- Test auth users are created by the RLS test harness / Studio, not here, so this file
-- stays portable across local auth schema versions.

select 1;
