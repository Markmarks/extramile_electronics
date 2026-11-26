-- Migration — customer data rights + guest order claim (PRD §4.7, §5 Compliance).
--
-- 1. consent_log: an append-only record of each marketing consent change (Data Protection
--    Act 2012 — we must be able to show when and how consent was given or withdrawn).
--    set_marketing_consent() is the only writer: it flips profiles.marketing_opt_in for
--    the caller and logs the change in one transaction.
-- 2. claim_guest_orders(): links guest orders placed with a user's email to their account.
--    Service-role only — the storefront calls it after confirming, from the verified auth
--    user, that the email is confirmed. A browser can never claim someone else's orders.
-- 3. detach_customer(): prepares a customer account for deletion. Orders, payments and
--    coupon redemptions are business/tax/warranty records and are kept, but unlinked
--    from the account (user_id → null). Addresses, carts, reviews and wishlist go with the
--    profile (ON DELETE CASCADE) when the server then deletes the auth user. Refuses staff
--    and admins: their ids are on the stock and audit trails.
--
-- Rollback: drop function set_marketing_consent(boolean, text), claim_guest_orders(uuid, text),
--           detach_customer(uuid); drop table consent_log;

create table public.consent_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('marketing_email')),
  granted boolean not null,
  source text not null default 'web',
  created_at timestamptz not null default now()
);
create index consent_log_user_idx on public.consent_log (user_id, created_at desc);

alter table public.consent_log enable row level security;
create policy own_consent_read on public.consent_log
  for select using (user_id = auth.uid() or is_staff());
-- No insert/update/delete policies: written only by set_marketing_consent().
revoke insert, update, delete on public.consent_log from anon, authenticated;

create or replace function public.set_marketing_consent(
  p_granted boolean,
  p_source text default 'web'
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_prev boolean;
begin
  if v_user is null then
    raise exception 'NOT_SIGNED_IN' using errcode = 'insufficient_privilege';
  end if;
  if p_granted is null then
    raise exception 'INVALID_CONSENT' using errcode = 'check_violation';
  end if;

  select marketing_opt_in into v_prev from profiles where id = v_user for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if v_prev is distinct from p_granted then
    update profiles set marketing_opt_in = p_granted where id = v_user;
    insert into consent_log (user_id, kind, granted, source)
    values (v_user, 'marketing_email', p_granted, left(coalesce(p_source, 'web'), 20));
  end if;
  return p_granted;
end $$;

revoke execute on function public.set_marketing_consent(boolean, text) from public, anon;
grant execute on function public.set_marketing_consent(boolean, text) to authenticated, service_role;

create or replace function public.claim_guest_orders(p_user uuid, p_email text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if p_user is null or coalesce(trim(p_email), '') = '' then
    return 0;
  end if;
  if not exists (select 1 from profiles where id = p_user) then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  update orders
     set user_id = p_user
   where user_id is null
     and lower(trim(email)) = lower(trim(p_email));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.claim_guest_orders(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_guest_orders(uuid, text) to service_role;

create or replace function public.detach_customer(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
  v_n int;
begin
  select role into v_role from profiles where id = p_user;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if v_role <> 'customer' then
    raise exception 'STAFF_ACCOUNT: staff and admin accounts are removed by an admin'
      using errcode = 'insufficient_privilege';
  end if;

  update orders set user_id = null where user_id = p_user;
  get diagnostics v_n = row_count;
  update coupon_redemptions set user_id = null where user_id = p_user;
  return v_n;
end $$;

revoke execute on function public.detach_customer(uuid) from public, anon, authenticated;
grant execute on function public.detach_customer(uuid) to service_role;
