-- Dalil Pi — price history, buyer reviews, disputes, target prices, shop questions, Telegram

-- Every confirmed price Dalil Pi sees (at most one row per product per day)
create table if not exists public.price_history (
  url_key   text not null,               -- host + path, lowercase (see normUrl)
  day       date not null default (now() at time zone 'UTC')::date,
  price     numeric(18, 7) not null,
  currency  text not null,
  title     text,
  store     text,
  url       text,
  image     text,
  country   text,
  primary key (url_key, day)
);
create index if not exists price_history_day_idx on public.price_history (day desc, country);

-- Reviews from Dalil Pi buyers (one per order)
create table if not exists public.store_reviews (
  id            uuid primary key default gen_random_uuid(),
  pi_uid        text not null references public.users(pi_uid) on delete cascade,
  order_id      uuid not null unique references public.orders(id) on delete cascade,
  store_domain  text,
  store_name    text not null,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);
create index if not exists store_reviews_domain_idx on public.store_reviews (store_domain);
create index if not exists store_reviews_name_idx on public.store_reviews (lower(store_name));

-- Problems with an order (feeds the trust score)
create table if not exists public.disputes (
  id            uuid primary key default gen_random_uuid(),
  pi_uid        text not null references public.users(pi_uid) on delete cascade,
  order_id      uuid not null unique references public.orders(id) on delete cascade,
  store_domain  text,
  store_name    text not null,
  kind          text not null check (kind in ('not_delivered', 'not_as_described', 'scam', 'other')),
  details       text,
  status        text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at    timestamptz not null default now()
);
create index if not exists disputes_domain_idx on public.disputes (store_domain);
create index if not exists disputes_name_idx on public.disputes (lower(store_name));

-- Target price on watched products + which alerts were already sent
alter table public.watches add column if not exists target_price numeric(18, 7);
alter table public.watches add column if not exists target_hit_at timestamptz;
alter table public.watches add column if not exists notified_at timestamptz;

-- Questions to registered merchants ("Ask the shop")
create table if not exists public.shop_questions (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  pi_uid       text not null references public.users(pi_uid) on delete cascade,
  question     text not null,
  answer       text,
  answered_at  timestamptz,
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists shop_questions_merchant_idx on public.shop_questions (merchant_id, created_at desc);
create index if not exists shop_questions_user_idx on public.shop_questions (pi_uid, created_at desc);

-- Telegram link (bot notifications)
create table if not exists public.telegram_links (
  pi_uid        text primary key references public.users(pi_uid) on delete cascade,
  chat_id       bigint unique,
  link_code     text unique,
  code_expires  timestamptz,
  linked_at     timestamptz,
  last_digest   timestamptz
);

alter table public.price_history  enable row level security;
alter table public.store_reviews  enable row level security;
alter table public.disputes       enable row level security;
alter table public.shop_questions enable row level security;
alter table public.telegram_links enable row level security;
