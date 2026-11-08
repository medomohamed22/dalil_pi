-- Dalil Pi — owner settings (admin password hash, home row, hidden stores) and no free AI.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

-- AI (Ask Dalil) needs a plan or an AI top-up; search, browsing and orders stay free.
update public.plans set searches_quota = 0 where id = 'free';
