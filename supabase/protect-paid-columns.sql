-- ============================================================
--  Buy Sell Trade Sxm — protect billing / paid-feature columns
--  Run in: Supabase Dashboard > SQL Editor > New query > paste all > Run
--  Idempotent — safe to re-run. Run AFTER admin-upgrade.sql.
--
--  WHY: "profiles: chacun gère le sien" and "listings: modifier la
--  sienne" let a user UPDATE any column of their own row (RLS only
--  checks auth.uid() = id / seller_id — it has no column allow-list).
--  Only profiles.role has ever been protected from this (see
--  protect_profile_role in admin-fix.sql). Every other paid-feature
--  column was wide open: any signed-in user could grant themselves
--  an active Pro subscription, a higher listing_limit plan, the
--  Pro seller badge, or a paid boost with a single client-side
--  `update()` call from the browser console — no payment required,
--  and can_publish_listing() / the UI would trust it.
--
--  This mirrors protect_profile_role exactly: a BEFORE trigger pins
--  protected columns back to their old value unless the writer is an
--  admin, or the write has no JWT context at all (auth.uid() is null
--  — i.e. a service-role call, such as a future Stripe webhook Edge
--  Function). Regular authenticated INSERT/UPDATE calls can never
--  set these columns themselves.
-- ============================================================

-- ------------------------------------------------------------
--  1) profiles — billing / plan columns
-- ------------------------------------------------------------
create or replace function public.protect_profile_billing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- OLD does not exist yet on INSERT — force safe defaults directly,
    -- never trust whatever plan/status the client tried to insert with.
    new.account_plan := 'personal-free';
    new.subscription_status := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.subscription_started := null;
    new.subscription_current_period_end := null;
    new.subscription_cancel_at_period_end := false;
    return new;
  end if;
  -- UPDATE: pin every billing column back to its stored value —
  -- a non-admin, non-service-role writer can never move these.
  new.account_plan := old.account_plan;
  new.subscription_status := old.subscription_status;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_started := old.subscription_started;
  new.subscription_current_period_end := old.subscription_current_period_end;
  new.subscription_cancel_at_period_end := old.subscription_cancel_at_period_end;
  return new;
end;
$$;

drop trigger if exists protect_profile_billing_trigger on public.profiles;
create trigger protect_profile_billing_trigger
  before insert or update on public.profiles
  for each row execute function public.protect_profile_billing();

-- ------------------------------------------------------------
--  2) listings — boost + Pro-badge columns
--     NOTE: is_urgent and is_featured are deliberately NOT touched
--     here — they're free, user-toggleable fields in the current
--     product (the "Vente urgente" checkbox is open to everyone,
--     and feat defaults true for every new post), not payment-gated,
--     so locking them down would break normal posting.
--
--     On INSERT: is_pro is recomputed from the seller's real,
--     server-trusted profile status (same test already used by
--     compute_listing_moderation_status) instead of trusting
--     whatever the client sent. Boost fields always start empty —
--     boosting is a separate, later action, and today nothing
--     authenticated is even supposed to set is_boosted at insert.
--     On UPDATE: is_pro and every boost_* column are pinned back —
--     there is currently no authenticated-user path that should
--     ever change them (a real boost purchase must go through a
--     service-role Edge Function once payments are wired up, the
--     same pattern as admin-delete-user).
-- ------------------------------------------------------------
create or replace function public.protect_listing_boost_flags()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  seller_is_pro boolean;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select (account_type = 'business' and coalesce(subscription_status, '') = 'active')
      into seller_is_pro
      from public.profiles
     where id = new.seller_id;
    new.is_pro := coalesce(seller_is_pro, false);
    new.is_boosted := false;
    new.boost_days := null;
    new.boost_price_eur := null;
    new.boost_price_usd := null;
    new.boost_started_at := null;
    new.boost_source := null;
    new.boost_month := null;
    new.boost_plan := null;
    return new;
  end if;

  new.is_pro := old.is_pro;
  new.is_boosted := old.is_boosted;
  new.boost_days := old.boost_days;
  new.boost_price_eur := old.boost_price_eur;
  new.boost_price_usd := old.boost_price_usd;
  new.boost_started_at := old.boost_started_at;
  new.boost_source := old.boost_source;
  new.boost_month := old.boost_month;
  new.boost_plan := old.boost_plan;
  return new;
end;
$$;

drop trigger if exists protect_listing_boost_flags_trigger on public.listings;
create trigger protect_listing_boost_flags_trigger
  before insert or update on public.listings
  for each row execute function public.protect_listing_boost_flags();

-- ------------------------------------------------------------
--  Sanity check — run manually after applying, as a NON-admin
--  user's session (or read the result of this from the SQL editor
--  using your own admin session, it's just informational here):
--  the trigger only rejects other users' auth.uid() sessions, so
--  you cannot fully verify from an admin SQL editor session.
--  From the browser console while logged in as a normal test user:
--    await db.from('profiles').update({ subscription_status: 'active' }).eq('id', (await db.auth.getUser()).data.user.id).select()
--  Expect the row back with subscription_status unchanged (null),
--  not 'active'.
-- ============================================================
