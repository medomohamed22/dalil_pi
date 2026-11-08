-- Dalil Pi — "Dalil Index": our own copy of the public catalogs of trusted Pi stores
-- (Pi Chain Mall, Salla Shop Mall, Global Trade Pi). Filled by plain code in the
-- background (no AI), searched instantly instead of browsing each store per question.

create table if not exists public.catalog_items (
  id           text primary key,              -- "<source>:<id at the store>"
  source       text not null,                 -- pcm | salla | gtp
  title        text not null,
  title_ar     text,
  description  text,
  price        numeric(18, 7),                -- in Pi (pcm, gtp)
  price_egp    numeric(18, 2),                -- Salla lists EGP; the Pi price is computed with its own rate
  list_price_egp numeric(18, 2),              -- Salla "was" price (EGP)
  url          text not null,
  image        text,
  images       jsonb not null default '[]'::jsonb,
  seller       text,
  country      text,                          -- ISO code of the seller, when the store says
  category     text,
  tags         text[] not null default '{}',
  in_stock     boolean not null default true,
  stock        integer,
  digital      boolean not null default false,
  active       boolean not null default true, -- false once it disappears from the store
  hash         text,                          -- fingerprint of the fields above (change detection)
  first_seen_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  seen_at      timestamptz not null default now()
);
create index if not exists catalog_items_source_idx on public.catalog_items (source, active);

-- One row per store: when it was last read, how it went, and a refresh lock.
create table if not exists public.catalog_sources (
  source       text primary key,
  refreshed_at timestamptz,
  lock_until   timestamptz,
  items        integer not null default 0,
  ok           boolean,
  error        text,
  duration_ms  integer,
  meta         jsonb not null default '{}'::jsonb  -- e.g. Salla's EGP→Pi settings
);
insert into public.catalog_sources (source) values ('pcm'), ('salla'), ('gtp') on conflict (source) do nothing;

alter table public.catalog_items   enable row level security;
alter table public.catalog_sources enable row level security;
