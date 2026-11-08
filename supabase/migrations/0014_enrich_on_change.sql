-- Dalil Index: when a product's fingerprint changes, its AI enrichment is cleared so it is
-- re-read once (the enrichment job only picks rows with enriched_hash = null).
create or replace function public.catalog_reset_enrichment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.hash is distinct from old.hash then
    new.enriched_hash := null;
  end if;
  return new;
end;
$$;
drop trigger if exists catalog_reset_enrichment on public.catalog_items;
create trigger catalog_reset_enrichment before update on public.catalog_items
for each row execute function public.catalog_reset_enrichment();
create index if not exists catalog_items_unenriched_idx on public.catalog_items (id) where enriched_hash is null and active;
