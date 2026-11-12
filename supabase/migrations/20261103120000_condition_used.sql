-- Migration — add a "fairly used" product condition.
-- Additive only: existing rows keep their condition; search_products' p_condition
-- parameter accepts the new value automatically (it is typed product_cond).
-- Rollback: Postgres can't drop an enum value; re-create the type without 'used'
-- after moving any 'used' products to another condition.

alter type product_cond add value if not exists 'used';
