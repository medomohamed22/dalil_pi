-- Supabase advisors (Nov 2026): index the two foreign keys without one, drop indexes that only
-- duplicate another (every write pays for each index).

create index if not exists store_reviews_user_idx on public.store_reviews (pi_uid);
create index if not exists disputes_user_idx on public.disputes (pi_uid);

-- (pi_uid, status, ends_at) already serves every lookup by user.
drop index if exists public.subscriptions_user_idx;
-- Same column as the unique constraint subscriptions_payment_id_key.
drop index if exists public.subscriptions_payment_uidx;
-- Nothing filters payments or subscriptions by plan.
drop index if exists public.payments_plan_idx;
drop index if exists public.subscriptions_plan_idx;

-- pg_net stays in "public": a pg_cron job outside Dalil Pi (sahm-gap-logger) calls net.http_post
-- unqualified, and moving the extension would break it.
