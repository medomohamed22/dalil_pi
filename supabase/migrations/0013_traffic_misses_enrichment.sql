-- Dalil Pi — traffic sent to stores, searches with no results, AI-enriched catalog fields.

-- 1) Every visit / order Dalil Pi sends to a store (kept 180 days; the daily job purges older rows).
create table if not exists public.click_events (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  store     text not null,             -- store name as shown (e.g. "Salla Shop Mall")
  domain    text,                      -- host of the link
  url       text,
  title     text,
  kind      text not null check (kind in ('visit', 'order')),
  country   text,
  pi_uid    text                       -- signed-in buyer, if any (never shown in stats)
);
create index if not exists click_events_at_idx on public.click_events (at desc);
create index if not exists click_events_store_idx on public.click_events (store, at desc);

-- 2) Searches that found nothing (what people want that the Pi stores don't have yet).
create table if not exists public.search_misses (
  q         text not null,
  country   text not null,
  n         integer not null default 1,
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  primary key (q, country)
);
create index if not exists search_misses_n_idx on public.search_misses (n desc, last_at desc);

create or replace function public.record_miss(p_q text, p_country text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.search_misses as m (q, country) values (left(lower(trim(p_q)), 120), upper(p_country))
  on conflict (q, country) do update set n = m.n + 1, last_at = now();
$$;

create or replace function public.purge_clicks()
returns integer
language sql
security definer
set search_path = public
as $$
  with x as (delete from public.click_events where at < now() - interval '180 days' returning 1)
  select count(*)::int from x;
$$;

revoke all on function public.record_miss(text, text) from public, anon, authenticated;
revoke all on function public.purge_clicks() from public, anon, authenticated;
grant execute on function public.record_miss(text, text) to service_role;
grant execute on function public.purge_clicks() to service_role;

-- 3) Catalog fields filled once per product by AI (brand, model, category, titles) + twin key.
alter table public.catalog_items add column if not exists brand text;
alter table public.catalog_items add column if not exists model text;
alter table public.catalog_items add column if not exists norm_category text;
alter table public.catalog_items add column if not exists title_en text;
alter table public.catalog_items add column if not exists keywords text[] not null default '{}';
alter table public.catalog_items add column if not exists twin_key text;
alter table public.catalog_items add column if not exists enriched_hash text;
create index if not exists catalog_items_twin_idx on public.catalog_items (twin_key) where twin_key is not null;

alter table public.click_events  enable row level security;
alter table public.search_misses enable row level security;
