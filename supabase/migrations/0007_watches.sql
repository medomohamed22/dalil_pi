-- Dalil Pi — watchlist / price-drop alerts
create table if not exists public.watches (
  id               uuid primary key default gen_random_uuid(),
  pi_uid           text not null references public.users(pi_uid) on delete cascade,
  url              text not null,
  title            text not null,
  store            text not null,
  image            text,
  currency         text not null,
  price            numeric(18, 7) not null,      -- price when the user saved it
  last_price       numeric(18, 7) not null,      -- latest price seen by the daily check
  last_checked_at  timestamptz,
  dropped_at       timestamptz,                  -- last time the price went down
  seen_drop        boolean not null default true,-- false = an unseen price drop
  created_at       timestamptz not null default now(),
  unique (pi_uid, url)
);
create index if not exists watches_check_idx on public.watches (last_checked_at nulls first);
create index if not exists watches_user_idx on public.watches (pi_uid, created_at desc);
alter table public.watches enable row level security;
