-- Dalil Pi — merchants who register their shop directly ("Dalil Pi for merchants")
-- New shops start as 'pending'. Approve one in the Supabase table editor (status = 'approved').
create table if not exists public.merchants (
  id           uuid primary key default gen_random_uuid(),
  pi_uid       text not null unique references public.users(pi_uid) on delete cascade,  -- one shop per Pi account
  name         text not null,
  kind         text not null default 'local' check (kind in ('online', 'local', 'service')),
  country      text not null check (country ~ '^[A-Z]{2}$'),
  city         text,
  address      text,
  lat          double precision,
  lon          double precision,
  phone        text,
  website      text,
  description  text,
  categories   text,                       -- keywords: "coffee, pastries"
  items        jsonb not null default '[]',-- [{ "title": "...", "price": 1.5 }] priced in Pi, max 20
  pi_wallet    text,                       -- public wallet address (optional)
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists merchants_search_idx on public.merchants (status, country);
alter table public.merchants enable row level security;
drop trigger if exists merchants_touch on public.merchants;
create trigger merchants_touch before update on public.merchants for each row execute function public.touch_updated_at();
