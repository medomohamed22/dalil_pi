-- Dalil Pi — initial schema (Supabase / Postgres)
-- Run in the Supabase SQL editor, or with `supabase db push`.
-- The app talks to these tables only from the server with the service-role key.
-- Row Level Security is ON with no policies, so the public anon key can read/write nothing.

-- Pi users (one row per Pi account, keyed by the app-specific Pi uid)
create table if not exists public.users (
  pi_uid        text primary key,
  username      text,
  country       text,            -- ISO 3166-1 alpha-2 the user picked (null = use IP)
  lang          text not null default 'en' check (lang in ('en', 'ar')),
  plan          text not null default 'free',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- Monthly usage per user (period = 'YYYY-MM', UTC)
create table if not exists public.usage (
  pi_uid          text not null references public.users(pi_uid) on delete cascade,
  period          text not null,
  searches        integer not null default 0,
  orders          integer not null default 0,
  bonus_searches  integer not null default 0,   -- e.g. from rewarded ads
  updated_at      timestamptz not null default now(),
  primary key (pi_uid, period)
);

-- Paid plans (filled in a later phase; created now so the schema is stable)
create table if not exists public.subscriptions (
  id               bigint generated always as identity primary key,
  pi_uid           text not null references public.users(pi_uid) on delete cascade,
  plan             text not null,
  searches_quota   integer not null,
  orders_quota     integer not null,
  price_pi         numeric(18, 7) not null,
  price_usd        numeric(10, 2) not null,
  pi_usd_rate      numeric(18, 8) not null,
  payment_id       text unique,
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null,
  created_at       timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (pi_uid, ends_at desc);

-- Pi payments made to the app (subscriptions only — product payments go to the stores)
create table if not exists public.payments (
  payment_id   text primary key,
  pi_uid       text references public.users(pi_uid) on delete set null,
  amount       numeric(18, 7) not null,
  memo         text,
  metadata     jsonb,
  status       text not null default 'created',   -- created | approved | completed | cancelled | error
  txid         text,
  network      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Generic expiring counters (rate limits, daily AI caps)
create table if not exists public.counters (
  key         text primary key,
  value       integer not null default 0,
  expires_at  timestamptz not null
);
create index if not exists counters_expires_idx on public.counters (expires_at);

alter table public.users          enable row level security;
alter table public.usage          enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.payments       enable row level security;
alter table public.counters       enable row level security;

-- Atomic counter: increments key and returns the new value; restarts after it expires.
create or replace function public.incr_counter(p_key text, p_ttl_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  insert into public.counters as c (key, value, expires_at)
  values (p_key, 1, now() + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update
    set value      = case when c.expires_at < now() then 1 else c.value + 1 end,
        expires_at = case when c.expires_at < now() then now() + make_interval(secs => p_ttl_seconds) else c.expires_at end
  returning value into v;
  return v;
end;
$$;

-- Atomic usage increment for the current period; returns the row after the update.
create or replace function public.add_usage(p_uid text, p_period text, p_searches integer, p_orders integer)
returns public.usage
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.usage;
begin
  insert into public.usage as u (pi_uid, period, searches, orders)
  values (p_uid, p_period, greatest(p_searches, 0), greatest(p_orders, 0))
  on conflict (pi_uid, period) do update
    set searches   = u.searches + greatest(p_searches, 0),
        orders     = u.orders + greatest(p_orders, 0),
        updated_at = now()
  returning * into r;
  return r;
end;
$$;

-- Housekeeping: delete expired counters (call from a scheduled job if you like).
create or replace function public.purge_counters()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.counters where expires_at < now() - interval '1 day';
$$;

-- Only the service role may call the functions.
revoke all on function public.incr_counter(text, integer) from public, anon, authenticated;
revoke all on function public.add_usage(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.purge_counters() from public, anon, authenticated;
grant execute on function public.incr_counter(text, integer) to service_role;
grant execute on function public.add_usage(text, text, integer, integer) to service_role;
grant execute on function public.purge_counters() to service_role;
