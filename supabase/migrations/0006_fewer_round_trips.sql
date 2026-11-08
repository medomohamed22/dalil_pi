-- Dalil Pi — fewer database round trips per request
--
-- Before: a search made ~9 calls (rate limit, quota, packs, hourly limit, two daily AI caps,
-- consume, quota, packs). Now: begin_search (1) + use_credit (1).
-- /api/me: 3 calls → me_state (1), and last_seen_at is written at most once an hour.

-- Everything the app needs about a user's credit, as one JSON value.
create or replace function public.user_state(p_uid text, p_period text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plan', q.plan,
    'searches_quota', q.searches_quota,
    'orders_quota', q.orders_quota,
    'ends_at', q.ends_at,
    'searches_used', q.searches_used,
    'orders_used', q.orders_used,
    'packs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id::text, 'plan', s.plan,
               'searches_quota', s.searches_quota, 'orders_quota', s.orders_quota,
               'searches_used', s.searches_used, 'orders_used', s.orders_used,
               'starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.ends_at, s.id)
      from public.subscriptions s
      where s.pi_uid = p_uid and s.status = 'active' and s.ends_at > now()
    ), '[]'::jsonb)
  )
  from public.user_quota(p_uid, p_period) q;
$$;

-- Increment several expiring counters at once.
-- p_items: [{ "key": "...", "ttl": 3600, "limit": 10, "code": "HOURLY_LIMIT" }, ...]
-- Returns the code of the first counter that went over its limit, or null.
create or replace function public.incr_counters(p_items jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  it   jsonb;
  v    integer;
  over text := null;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v := public.incr_counter(it->>'key', (it->>'ttl')::int);
    if over is null and it ? 'limit' and v > (it->>'limit')::int then
      over := coalesce(it->>'code', 'LIMIT');
    end if;
  end loop;
  return over;
end;
$$;

-- Before the AI runs: quota check + rate limits + daily AI caps in one call.
-- Returns { ok, code?, state }.
create or replace function public.begin_search(p_uid text, p_period text, p_counters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st   jsonb := public.user_state(p_uid, p_period);
  over text;
begin
  if (st->>'searches_used')::int >= (st->>'searches_quota')::int then
    return jsonb_build_object('ok', false, 'code', 'QUOTA_EXCEEDED', 'state', st);
  end if;
  over := public.incr_counters(p_counters);
  if over is not null then
    return jsonb_build_object('ok', false, 'code', over, 'state', st);
  end if;
  return jsonb_build_object('ok', true, 'state', st);
end;
$$;

-- Take one search/order and return the fresh state (was: consume + 2 reads).
create or replace function public.use_credit(p_uid text, p_kind text, p_period text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  src text := public.consume_credit(p_uid, p_kind, p_period);
begin
  return public.user_state(p_uid, p_period) || jsonb_build_object('source', src);
end;
$$;

-- Sign-in / page load: upsert the user (last_seen_at at most hourly) + prefs + state, one call.
create or replace function public.me_state(p_uid text, p_username text, p_period text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.users;
begin
  insert into public.users as x (pi_uid, username, last_seen_at)
  values (p_uid, p_username, now())
  on conflict (pi_uid) do update
    set username = coalesce(excluded.username, x.username),
        last_seen_at = now()
    where x.last_seen_at < now() - interval '1 hour'
       or (excluded.username is not null and x.username is distinct from excluded.username);
  select * into u from public.users where pi_uid = p_uid;
  return jsonb_build_object('country', u.country, 'lang', u.lang, 'email', u.email, 'state', public.user_state(p_uid, p_period));
end;
$$;

revoke all on function public.user_state(text, text) from public, anon, authenticated;
revoke all on function public.incr_counters(jsonb) from public, anon, authenticated;
revoke all on function public.begin_search(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.use_credit(text, text, text) from public, anon, authenticated;
revoke all on function public.me_state(text, text, text) from public, anon, authenticated;
grant execute on function public.user_state(text, text) to service_role;
grant execute on function public.incr_counters(jsonb) to service_role;
grant execute on function public.begin_search(text, text, jsonb) to service_role;
grant execute on function public.use_credit(text, text, text) to service_role;
grant execute on function public.me_state(text, text, text) to service_role;
