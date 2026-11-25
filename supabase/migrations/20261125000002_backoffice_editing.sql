-- Migration — permissions for the back-office editing screens (2026-11-25).
--
-- The back-office gains screens for delivery zones, coupons, review moderation, email
-- opt-outs and refund history. Until now those tables had no staff policies at all
-- (shipping_zones, reviews, email_suppressions, refunds) or let any staff member rewrite
-- them (coupons). Money-affecting settings — delivery fees and discounts — become
-- admin-only; staff can still read them. create_order() keeps doing the arithmetic
-- (README rule 4): these screens only change the inputs it reads.
--
-- Rollback: drop the policies, triggers and checks created here; drop function
--   is_admin(), refresh_product_rating(); restore `create policy staff_cpn on coupons for
--   all using (is_staff()) with check (is_staff())` and grant insert, update, delete on
--   coupons, update on reviews, update/delete on shipping_zones to authenticated.

-- ── Admin check (mirrors is_staff) ─────────────────────────────────────────────
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ── Delivery zones: staff read every zone (incl. switched-off), admins edit ──────
create policy staff_read_zone on shipping_zones for select using (is_staff());
create policy admin_insert_zone on shipping_zones for insert with check (is_admin());
create policy admin_update_zone on shipping_zones for update using (is_admin()) with check (is_admin());
-- No delete: orders and saved addresses point at zones. Switch a zone off instead.
revoke delete on public.shipping_zones from authenticated;

alter table shipping_zones
  add constraint shipping_zones_name_check check (length(btrim(name)) between 1 and 80),
  add constraint shipping_zones_fee_check check (base_fee >= 0),
  add constraint shipping_zones_free_over_check check (free_over is null or free_over > 0),
  add constraint shipping_zones_eta_check check (eta_days_min >= 0 and eta_days_max >= eta_days_min);

-- ── Coupons: staff read, admins create/edit; the redemption counter is server-only ─
drop policy staff_cpn on coupons;
create policy staff_read_cpn on coupons for select using (is_staff());
create policy admin_insert_cpn on coupons for insert with check (is_admin());
create policy admin_update_cpn on coupons for update using (is_admin()) with check (is_admin());
revoke insert, update, delete on public.coupons from authenticated;
grant insert (code, kind, value, min_subtotal, max_redemptions, per_user_limit, starts_at, ends_at, is_active)
  on public.coupons to authenticated;
-- The code is what customers type and what past orders recorded: fixed once created.
grant update (kind, value, min_subtotal, max_redemptions, per_user_limit, starts_at, ends_at, is_active)
  on public.coupons to authenticated;

alter table coupons
  add constraint coupons_code_check check (code ~ '^[A-Z0-9_-]{3,40}$'),
  add constraint coupons_value_check check (
    case kind
      when 'percent' then value between 1 and 100
      when 'fixed' then value > 0
      else value = 0
    end
  ),
  add constraint coupons_min_subtotal_check check (min_subtotal >= 0),
  add constraint coupons_max_redemptions_check check (max_redemptions is null or max_redemptions > 0),
  add constraint coupons_per_user_check check (per_user_limit >= 1),
  add constraint coupons_window_check check (starts_at is null or ends_at is null or ends_at > starts_at);

-- ── Reviews: staff see all and publish/hide; nothing else about a review changes ─
create policy staff_read_rev on reviews for select using (is_staff());
create policy staff_moderate_rev on reviews for update using (is_staff()) with check (is_staff());
revoke update on public.reviews from authenticated;
grant update (is_published) on public.reviews to authenticated;

-- Keep products.rating_avg / rating_count equal to their *published* reviews, so the
-- stars on the shop always match what customers can read.
create or replace function public.refresh_product_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
begin
  update products p
     set rating_avg = coalesce(r.avg, 0),
         rating_count = r.n
    from (
      select round(avg(rating)::numeric, 1) as avg, count(*)::int as n
        from reviews
       where product_id = v_product and is_published
    ) r
   where p.id = v_product;
  return null;
end;
$$;
revoke execute on function public.refresh_product_rating() from public, anon, authenticated;

create trigger reviews_refresh_rating
  after insert or delete or update of is_published, rating on reviews
  for each row execute function public.refresh_product_rating();

-- ── Email opt-outs: staff read; admins may add or lift one ───────────────────────
create policy staff_read_supp on email_suppressions for select using (is_staff());
create policy admin_insert_supp on email_suppressions for insert with check (is_admin());
create policy admin_delete_supp on email_suppressions for delete using (is_admin());
revoke update on public.email_suppressions from authenticated;

-- ── Refunds: staff can see the history on an order (still written only by the server) ─
create policy staff_read_refund on refunds for select using (is_staff());
revoke insert, update, delete on public.refunds from authenticated;
