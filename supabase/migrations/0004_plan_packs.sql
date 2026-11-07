-- Dalil Pi — paid plans as 30-day credit packs
--
-- Every purchase (Basic / Plus / Pro / Top-up) is one row in public.subscriptions
-- that lasts 30 days from the moment it is paid. Unused searches/orders in a
-- pack simply expire with it. The free plan stays a monthly allowance kept in
-- public.usage (period = 'YYYY-MM', UTC).
--
-- A search/order is taken from whichever credit expires first (the free
-- allowance expires at the end of the month; a pack 30 days after purchase).

alter table public.subscriptions add column if not exists searches_used integer not null default 0 check (searches_used >= 0);
alter table public.subscriptions add column if not exists orders_used   integer not null default 0 check (orders_used >= 0);
create unique index if not exists subscriptions_payment_uidx on public.subscriptions (payment_id) where payment_id is not null;

-- Top-ups are packs too now: 30 days, like every plan.
update public.plans set duration_days = 30 where id = 'topup';

-- What was quoted for a payment (filled at approval, used at completion)
alter table public.payments add column if not exists plan        text references public.plans(id);
alter table public.payments add column if not exists price_usd   numeric(10, 2);
alter table public.payments add column if not exists pi_usd_rate numeric(18, 8);

-- Quota of a user right now: free monthly allowance + every pack that hasn't expired.
-- (Same signature/columns as before, so existing callers keep working.)
create or replace function public.user_quota(p_uid text, p_period text)
returns table (plan text, searches_quota integer, orders_quota integer, ends_at timestamptz, searches_used integer, orders_used integer)
language sql
stable
security definer
set search_path = public
as $$
  with packs as (
    select s.plan, s.searches_quota, s.orders_quota, s.searches_used, s.orders_used, s.ends_at, p.sort_order
    from public.subscriptions s
    join public.plans p on p.id = s.plan
    where s.pi_uid = p_uid and s.status = 'active' and s.ends_at > now()
  ),
  top as (
    select k.plan, k.ends_at from packs k where k.plan <> 'topup' order by k.sort_order desc, k.ends_at desc limit 1
  ),
  sums as (
    select coalesce(sum(k.searches_quota), 0)::int as sq, coalesce(sum(k.orders_quota), 0)::int as oq,
           coalesce(sum(k.searches_used), 0)::int as su, coalesce(sum(k.orders_used), 0)::int as ou,
           max(k.ends_at) filter (where k.plan <> 'topup') as plan_ends
    from packs k
  )
  select coalesce((select t.plan from top t), 'free'),
         (f.searches_quota + coalesce(u.bonus_searches, 0) + s.sq)::int,
         (f.orders_quota + s.oq)::int,
         s.plan_ends,
         (least(coalesce(u.searches, 0), f.searches_quota + coalesce(u.bonus_searches, 0)) + s.su)::int,
         (least(coalesce(u.orders, 0), f.orders_quota) + s.ou)::int
  from public.plans f
  cross join sums s
  left join public.usage u on u.pi_uid = p_uid and u.period = p_period
  where f.id = 'free';
$$;

-- Take one search or order from the credit that expires first.
-- Returns 'free', the pack id, or null when nothing is left.
create or replace function public.consume_credit(p_uid text, p_kind text, p_period text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota   integer;
  v_used    integer;
  v_bonus   integer;
  v_free_ex timestamptz;
  v_pack    record;
begin
  if p_kind not in ('search', 'order') then
    raise exception 'consume_credit: bad kind %', p_kind;
  end if;
  -- one consumer per user at a time
  perform pg_advisory_xact_lock(hashtext('dalil-credit:' || p_uid));

  select case when p_kind = 'search' then f.searches_quota else f.orders_quota end into v_quota from public.plans f where f.id = 'free';
  select case when p_kind = 'search' then u.searches else u.orders end,
         case when p_kind = 'search' then u.bonus_searches else 0 end
    into v_used, v_bonus
    from public.usage u where u.pi_uid = p_uid and u.period = p_period;
  v_free_ex := (to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp at time zone 'UTC';

  select s.id, s.ends_at into v_pack
  from public.subscriptions s
  where s.pi_uid = p_uid and s.status = 'active' and s.ends_at > now()
    and case when p_kind = 'search' then s.searches_used < s.searches_quota else s.orders_used < s.orders_quota end
  order by s.ends_at asc, s.id asc
  limit 1
  for update;

  if coalesce(v_quota, 0) + coalesce(v_bonus, 0) - coalesce(v_used, 0) > 0 and (v_pack.id is null or v_free_ex <= v_pack.ends_at) then
    insert into public.usage as u (pi_uid, period, searches, orders)
    values (p_uid, p_period, (p_kind = 'search')::int, (p_kind = 'order')::int)
    on conflict (pi_uid, period) do update
      set searches = u.searches + (p_kind = 'search')::int,
          orders = u.orders + (p_kind = 'order')::int,
          updated_at = now();
    return 'free';
  end if;

  if v_pack.id is not null then
    update public.subscriptions
      set searches_used = searches_used + (p_kind = 'search')::int,
          orders_used = orders_used + (p_kind = 'order')::int
      where id = v_pack.id;
    return v_pack.id::text;
  end if;
  return null;
end;
$$;

-- Turn a completed Pi payment into a 30-day pack (idempotent per payment).
create or replace function public.activate_payment(p_payment_id text, p_uid text, p_txid text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay  public.payments;
  v_plan public.plans;
  v_id   bigint;
begin
  select * into v_pay from public.payments where payment_id = p_payment_id for update;
  if v_pay.payment_id is null then raise exception 'activate_payment: unknown payment'; end if;
  if v_pay.pi_uid is distinct from p_uid then raise exception 'activate_payment: payment belongs to another user'; end if;
  if v_pay.plan is null then raise exception 'activate_payment: payment has no plan'; end if;

  select id into v_id from public.subscriptions where payment_id = p_payment_id;
  if v_id is null then
    select * into v_plan from public.plans where id = v_pay.plan and is_active and id <> 'free';
    if v_plan.id is null then raise exception 'activate_payment: plan % not available', v_pay.plan; end if;
    insert into public.subscriptions (pi_uid, plan, searches_quota, orders_quota, price_pi, price_usd, pi_usd_rate, payment_id, status, starts_at, ends_at)
    values (p_uid, v_plan.id, v_plan.searches_quota, v_plan.orders_quota, v_pay.amount, coalesce(v_pay.price_usd, v_plan.price_usd),
            coalesce(v_pay.pi_usd_rate, 0), p_payment_id, 'active', now(), now() + make_interval(days => greatest(v_plan.duration_days, 1)))
    returning id into v_id;
  end if;

  update public.payments set status = 'completed', txid = coalesce(p_txid, txid) where payment_id = p_payment_id;
  update public.users u set plan = coalesce((select q.plan from public.user_quota(p_uid, to_char(now() at time zone 'UTC', 'YYYY-MM')) q), 'free') where u.pi_uid = p_uid;
  return v_id;
end;
$$;

-- Mark packs whose 30 days are over (cosmetic: queries already ignore them by ends_at).
create or replace function public.expire_packs()
returns integer
language sql
security definer
set search_path = public
as $$
  with x as (update public.subscriptions set status = 'expired' where status = 'active' and ends_at <= now() returning 1)
  select count(*)::int from x;
$$;

revoke all on function public.user_quota(text, text) from public, anon, authenticated;
revoke all on function public.consume_credit(text, text, text) from public, anon, authenticated;
revoke all on function public.activate_payment(text, text, text) from public, anon, authenticated;
revoke all on function public.expire_packs() from public, anon, authenticated;
grant execute on function public.user_quota(text, text) to service_role;
grant execute on function public.consume_credit(text, text, text) to service_role;
grant execute on function public.activate_payment(text, text, text) to service_role;
grant execute on function public.expire_packs() to service_role;
