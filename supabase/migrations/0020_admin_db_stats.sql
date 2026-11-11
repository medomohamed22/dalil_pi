-- 0020: database load per table for the admin "performance" tab (counts and sizes only, no data).
create or replace function public.admin_db_stats()
returns json
language sql
security definer
set search_path = public, pg_catalog
as $$
  select json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select json_agg(t order by t.writes desc)
      from (
        select s.relname as name,
               s.n_live_tup as rows,
               s.n_dead_tup as dead,
               s.n_tup_ins as inserts,
               s.n_tup_upd as updates,
               s.n_tup_del as deletes,
               s.n_tup_ins + s.n_tup_upd + s.n_tup_del as writes,
               s.seq_scan + coalesce(s.idx_scan, 0) as reads,
               pg_total_relation_size(s.relid) as bytes
        from pg_stat_user_tables s
        where s.schemaname = 'public'
      ) t
    ), '[]'::json)
  );
$$;
revoke all on function public.admin_db_stats() from public, anon, authenticated;
grant execute on function public.admin_db_stats() to service_role;
