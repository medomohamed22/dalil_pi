-- 0016: AI credit taken before the AI runs (refund only when the server fails), housekeeping
-- for search misses, and no table access at all for the public API roles.

-- 1) Give back one credit taken by use_credit (p_source = what consume_credit returned:
--    'free' for the monthly allowance, else the pack id).
create or replace function public.refund_credit(p_uid text, p_kind text, p_period text, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('search', 'order') or p_source is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('dalil-credit:' || p_uid));
  if p_source = 'free' then
    update public.usage
      set searches = greatest(0, searches - (p_kind = 'search')::int),
          orders = greatest(0, orders - (p_kind = 'order')::int),
          updated_at = now()
      where pi_uid = p_uid and period = p_period;
  elsif p_source ~ '^[0-9]{1,18}$' then
    update public.subscriptions
      set searches_used = greatest(0, searches_used - (p_kind = 'search')::int),
          orders_used = greatest(0, orders_used - (p_kind = 'order')::int)
      where id = p_source::bigint and pi_uid = p_uid;
  end if;
end;
$$;
revoke all on function public.refund_credit(text, text, text, text) from public, anon, authenticated;
grant execute on function public.refund_credit(text, text, text, text) to service_role;

-- 2) Housekeeping: clicks after 180 days, searches with no result after 90 days.
create or replace function public.purge_clicks()
returns integer
language sql
security definer
set search_path = public
as $$
  with x as (delete from public.click_events where at < now() - interval '180 days' returning 1),
       y as (delete from public.search_misses where last_at < now() - interval '90 days' returning 1)
  select ((select count(*) from x) + (select count(*) from y))::int;
$$;
revoke all on function public.purge_clicks() from public, anon, authenticated;
grant execute on function public.purge_clicks() to service_role;

-- 3) Only the server (service role) talks to the database. RLS already denies the public roles
--    (no policies); this removes their table privileges too, so a leaked anon key reads nothing.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
