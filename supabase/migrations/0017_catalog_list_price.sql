-- 0017: "was" price in Pi (Salla's partner catalog API sends Pi prices, not EGP).
alter table public.catalog_items add column if not exists list_price numeric(18, 7);
