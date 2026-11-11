-- 0019: small shared cache for expensive reads (e.g. the Salla Local shop list that needs a
-- headless browser), so every server instance doesn't redo them. Server-only (service role).
create table if not exists public.kv_cache (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.kv_cache enable row level security;
revoke all on public.kv_cache from anon, authenticated;
