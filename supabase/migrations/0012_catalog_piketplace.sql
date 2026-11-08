-- Dalil Index: Piketplace (mpiket.pinet.com) + per-country shipping fees.
-- shipping: { "EG": 12.5, "NG": 0 } = the countries a listing ships to and the fee in Pi (0 = free).
alter table public.catalog_items add column if not exists shipping jsonb not null default '{}'::jsonb;
insert into public.catalog_sources (source) values ('pkt') on conflict (source) do nothing;
