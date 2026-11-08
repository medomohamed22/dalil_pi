-- Dalil Index: whether a listing ships to every country (Pi Chain Mall "global sale").
-- Listings without it are only shown in their seller's country.
alter table public.catalog_items add column if not exists ships_global boolean not null default false;
