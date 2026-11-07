-- Dalil Pi — profiles, plans, saved addresses, orders
-- Server-only access (service-role key). RLS stays ON with no public policies.

-- Pi usernames are unique on Pi; keep a fast case-insensitive lookup.
create unique index if not exists users_username_lower_idx on public.users (lower(username)) where username is not null;
alter table public.users add column if not exists display_name text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists phone text;

-- Plan catalog (prices in USD; the Pi price is computed from OKX at purchase time)
create table if not exists public.plans (
  id               text primary key,                 -- free | basic | plus | pro | topup
  name_en          text not null,
  name_ar          text not null,
  price_usd        numeric(10, 2) not null default 0,
  searches_quota   integer not null,
  orders_quota     integer not null,
  duration_days    integer not null default 30,      -- topup = added to the current month
  is_active        boolean not null default true,
  sort_order       integer not null default 0
);
insert into public.plans (id, name_en, name_ar, price_usd, searches_quota, orders_quota, duration_days, sort_order) values
  ('free',  'Free',  'مجانية',  0.00,   5,   2, 30, 0),
  ('basic', 'Basic', 'أساسية',  1.99,  60,  20, 30, 1),
  ('plus',  'Plus',  'بلس',     4.99, 180,  60, 30, 2),
  ('pro',   'Pro',   'برو',     9.99, 380, 150, 30, 3),
  ('topup', 'Top-up','شحن رصيد', 0.79,  20,   5,  0, 4)
on conflict (id) do update set
  name_en = excluded.name_en, name_ar = excluded.name_ar, price_usd = excluded.price_usd,
  searches_quota = excluded.searches_quota, orders_quota = excluded.orders_quota,
  duration_days = excluded.duration_days, sort_order = excluded.sort_order;

-- Link subscriptions to the plan catalog and track their state
alter table public.subscriptions add column if not exists status text not null default 'active'
  check (status in ('pending', 'active', 'expired', 'cancelled', 'refunded'));
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_plan_fkey') then
    alter table public.subscriptions add constraint subscriptions_plan_fkey foreign key (plan) references public.plans(id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_payment_fkey') then
    alter table public.subscriptions add constraint subscriptions_payment_fkey foreign key (payment_id) references public.payments(payment_id) on delete set null;
  end if;
end $$;
create index if not exists subscriptions_active_idx on public.subscriptions (pi_uid, status, ends_at desc);

-- Saved shipping addresses (one user can have several; one default)
create table if not exists public.addresses (
  id            uuid primary key default gen_random_uuid(),
  pi_uid        text not null references public.users(pi_uid) on delete cascade,
  label         text,                      -- e.g. Home, Work
  full_name     text not null,
  phone         text not null,
  country       text not null check (country ~ '^[A-Z]{2}$'),
  city          text not null,
  area          text,                      -- district / state
  street        text not null,
  building      text,                      -- building / floor / apartment
  postal_code   text,
  notes         text,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses (pi_uid, created_at desc);
create unique index if not exists addresses_one_default_idx on public.addresses (pi_uid) where is_default;

-- Orders the agent prepared / the user placed at a store (payment goes to the store, not to us)
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  pi_uid             text not null references public.users(pi_uid) on delete cascade,
  status             text not null default 'draft'
                     check (status in ('draft', 'placed', 'awaiting_payment', 'paid', 'shipped', 'delivered', 'cancelled', 'failed')),
  -- what was bought
  store_name         text not null,
  store_domain       text,
  product_title      text not null,
  product_url        text,
  product_image      text,
  quantity           integer not null default 1 check (quantity > 0),
  price              numeric(18, 7) not null,
  currency           text not null,              -- PI or the store's currency
  shipping_cost      numeric(18, 7),
  total              numeric(18, 7) not null,
  total_usd          numeric(12, 2),             -- ≈ at the OKX price when the order was made
  pi_usd_rate        numeric(18, 8),
  country            text,
  trust              text,                       -- verified | unknown | suspicious at order time
  offer              jsonb,                      -- signed offer snapshot
  -- where it ships (snapshot, so editing the address book never changes past orders)
  address_id         uuid references public.addresses(id) on delete set null,
  shipping           jsonb,
  -- store side
  connector          text,                       -- woo_sallanet | salla | deeplink | partner | manual
  external_order_id  text,
  checkout_url       text,
  txid               text,                       -- Pi blockchain transaction, if known
  tracking_number    text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (pi_uid, created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists addresses_touch on public.addresses;
create trigger addresses_touch before update on public.addresses for each row execute function public.touch_updated_at();
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

alter table public.plans     enable row level security;
alter table public.addresses enable row level security;
alter table public.orders    enable row level security;

-- Current quota of a user: active paid plan if any, otherwise the free plan; plus top-ups and bonuses of this period.
create or replace function public.user_quota(p_uid text, p_period text)
returns table (plan text, searches_quota integer, orders_quota integer, ends_at timestamptz, searches_used integer, orders_used integer)
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select s.plan, s.searches_quota, s.orders_quota, s.ends_at
    from public.subscriptions s
    where s.pi_uid = p_uid and s.status = 'active' and s.plan <> 'topup' and s.ends_at > now()
    order by s.ends_at desc
    limit 1
  ),
  topups as (
    select coalesce(sum(s.searches_quota), 0)::int as searches, coalesce(sum(s.orders_quota), 0)::int as orders
    from public.subscriptions s
    where s.pi_uid = p_uid and s.status = 'active' and s.plan = 'topup' and to_char(s.starts_at at time zone 'UTC', 'YYYY-MM') = p_period
  ),
  base as (
    select coalesce(a.plan, 'free') as plan,
           coalesce(a.searches_quota, f.searches_quota) as searches_quota,
           coalesce(a.orders_quota, f.orders_quota) as orders_quota,
           a.ends_at
    from public.plans f
    left join active a on true
    where f.id = 'free'
  )
  select b.plan,
         (b.searches_quota + t.searches + coalesce(u.bonus_searches, 0))::int,
         (b.orders_quota + t.orders)::int,
         b.ends_at,
         coalesce(u.searches, 0)::int,
         coalesce(u.orders, 0)::int
  from base b
  cross join topups t
  left join public.usage u on u.pi_uid = p_uid and u.period = p_period;
$$;

revoke all on function public.user_quota(text, text) from public, anon, authenticated;
grant execute on function public.user_quota(text, text) to service_role;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
