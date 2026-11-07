-- Dalil Pi — every plan gets as many orders as searches.
update public.plans set orders_quota = searches_quota where orders_quota <> searches_quota;
