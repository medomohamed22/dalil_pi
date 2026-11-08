-- Dalil Pi — indexes for foreign keys (Supabase performance advisor)
create index if not exists orders_address_idx       on public.orders (address_id);
create index if not exists payments_user_idx        on public.payments (pi_uid);
create index if not exists payments_plan_idx        on public.payments (plan);
create index if not exists subscriptions_plan_idx   on public.subscriptions (plan);
