-- 0018: Salla apps directory (partner API GET /services): restaurants, services, Salla Care,
-- Salla Go cities, mall services, Telegram products. Server-only (service role); no public access.
create table if not exists public.partner_services (
  key         text primary key,                 -- '<type>:<id>' (an id is unique only within its type)
  partner     text not null default 'salla',
  type        text not null,
  name        text not null,
  name_ar     text,
  image       text,
  countries   text[] not null default '{}',     -- empty = every country
  city        text,
  category    text,
  specialty   text,
  provider    text,
  price       numeric(18, 7),                   -- Pi, only when there is one clear price
  price_unit  text,
  rating      numeric(3, 1),
  ratings     integer,
  url         text not null,
  active      boolean not null default true,
  seen_at     timestamptz not null default now()
);
create index if not exists partner_services_active_idx on public.partner_services (partner, type) where active;
alter table public.partner_services enable row level security;
revoke all on public.partner_services from anon, authenticated;

-- Pull state + refresh lock (ETag, version) next to the catalogs' own rows.
insert into public.catalog_sources (source) values ('salla_services') on conflict (source) do nothing;
