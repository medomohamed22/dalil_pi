-- Pi gives each app its own uid for the same person, so the Mainnet app sees a new uid for a
-- username the Testnet app already saved. On a verified Pi sign-in, the old account moves to the
-- new uid: profile, addresses, orders, watches, shop, reviews, disputes, questions, Telegram link
-- and this month's usage. Plans bought with Test-Pi stay on the old (now nameless) row.
-- Never called for dev sign-ins (their username is not verified by Pi).

create or replace function public.claim_username(p_uid text, p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old public.users;
begin
  if p_username is null or p_uid like 'dev-%' then return; end if;
  select * into old from public.users
    where lower(username) = lower(p_username) and pi_uid <> p_uid
    for update;
  if not found then return; end if;

  -- Free the name first (unique index on lower(username)).
  update public.users set username = null where pi_uid = old.pi_uid;

  -- The new uid already has an account, or the old one was a dev account: only free the name.
  if old.pi_uid like 'dev-%' or exists (select 1 from public.users where pi_uid = p_uid) then return; end if;

  insert into public.users (pi_uid, username, country, lang, plan, created_at, last_seen_at, display_name, email, phone)
  values (p_uid, p_username, old.country, old.lang, 'free', old.created_at, now(), old.display_name, old.email, old.phone);

  update public.usage          set pi_uid = p_uid where pi_uid = old.pi_uid;
  update public.addresses      set pi_uid = p_uid where pi_uid = old.pi_uid;
  update public.orders         set pi_uid = p_uid where pi_uid = old.pi_uid;
  update public.watches        set pi_uid = p_uid where pi_uid = old.pi_uid;
  update public.merchants      set pi_uid = p_uid where pi_uid = old.pi_uid;
  update public.store_reviews  set pi_uid = p_uid where pi_uid = old.pi_uid;
  update public.disputes       set pi_uid = p_uid where pi_uid = old.pi_uid;
  update public.shop_questions set pi_uid = p_uid where pi_uid = old.pi_uid;
  update public.telegram_links set pi_uid = p_uid where pi_uid = old.pi_uid;
end;
$$;
revoke all on function public.claim_username(text, text) from public, anon, authenticated;
grant execute on function public.claim_username(text, text) to service_role;
