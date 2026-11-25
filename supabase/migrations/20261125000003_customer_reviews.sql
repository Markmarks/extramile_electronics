-- Migration — customers write reviews from the storefront (2026-11-25).
--
-- write_review (migration 006) decides *who* may review — the signed-in buyer of a
-- delivered order containing the product — but not *what* they may write. With the blanket
-- `grant insert on all tables ... to authenticated` (20261124000001) a customer calling the
-- API directly could insert is_published = true (skipping staff moderation), claim
-- is_verified_purchase, or point order_id at any order. From here:
--   * customers may only supply product_id, user_id, rating, title, body;
--   * is_published keeps its default (false) until staff publish it;
--   * order_id / is_verified_purchase are filled in by the database from the buyer's own
--     delivered orders, never taken from the caller;
--   * a customer can read their own review (to see "awaiting approval"), not others'
--     unpublished ones;
--   * title/body have length limits (the storefront validates the same with Zod).
--
-- Rollback: drop trigger reviews_fill_purchase on reviews; drop function
--   review_fill_purchase(); drop policy own_read_rev on reviews; alter table reviews drop
--   constraint reviews_title_check, drop constraint reviews_body_check;
--   grant insert on public.reviews to authenticated;

revoke insert on public.reviews from authenticated;
grant insert (product_id, user_id, rating, title, body) on public.reviews to authenticated;

create policy own_read_rev on reviews for select using (user_id = auth.uid());

alter table reviews
  add constraint reviews_title_check check (title is null or length(title) <= 120),
  add constraint reviews_body_check check (body is null or length(body) <= 4000);

create or replace function public.review_fill_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid;
begin
  select o.id into v_order
    from orders o
    join order_items oi on oi.order_id = o.id
    join product_variants v on v.id = oi.variant_id
   where o.user_id = new.user_id
     and o.status = 'delivered'
     and v.product_id = new.product_id
   order by o.created_at desc
   limit 1;
  new.order_id := v_order;
  new.is_verified_purchase := v_order is not null;
  return new;
end;
$$;
revoke execute on function public.review_fill_purchase() from public, anon, authenticated;

create trigger reviews_fill_purchase
  before insert on reviews
  for each row execute function public.review_fill_purchase();
