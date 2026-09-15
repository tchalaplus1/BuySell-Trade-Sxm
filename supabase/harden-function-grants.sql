-- Buy Sell Trade SXM -- tighten function/table grants flagged by
-- `supabase db advisors --linked --type security` on 2026-09-15.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default (unlike
-- tables, which default to no access). Several functions here only ever
-- added a grant for one role (e.g. "grant ... to service_role") without
-- revoking the PUBLIC default first, so anon/authenticated could still
-- call them directly via /rest/v1/rpc/<fn>. Each one was checked against
-- how the frontend actually calls it (supabase-api.js) before deciding
-- whether to keep authenticated access.
--
-- Run once against the linked project:
--   supabase db query --linked --file supabase/harden-function-grants.sql

-- ------------------------------------------------------------
-- 1) apply_automatic_included_boosts(): a cron-only batch job that loops
--    every business profile and applies their monthly included boosts.
--    It's idempotent per month, so calling it early can't grant more
--    boosts than a plan allows -- but there's no reason any signed-in
--    (or anonymous) visitor should be able to trigger a full-table batch
--    write on demand. Service role (cron) only.
-- ------------------------------------------------------------
revoke all on function public.apply_automatic_included_boosts() from public;
revoke all on function public.apply_automatic_included_boosts() from anon;
revoke all on function public.apply_automatic_included_boosts() from authenticated;
grant execute on function public.apply_automatic_included_boosts() to service_role;

-- included_boost_limit() had no search_path pinned -- harmless today (a
-- pure CASE expression, no table/operator lookups to hijack) but cheap to
-- close per Postgres's function search_path guidance.
create or replace function public.included_boost_limit(account_plan text)
returns integer
language sql
stable
set search_path = public
as $$
  select case account_plan
    when 'pro-starter' then 1
    when 'pro-business' then 2
    when 'pro-premium' then 5
    when 'pro-elite' then 10
    when 'pro-unlimited' then 20
    else 0
  end
$$;

-- ------------------------------------------------------------
-- 2) Trigger-only functions: never meant to be called directly via RPC,
--    only fired by their own `create trigger`. Revoke the PUBLIC default
--    so they don't show up as callable API endpoints at all.
-- ------------------------------------------------------------
revoke all on function public.handle_new_user() from public;
revoke all on function public.protect_listing_boost_flags() from public;
revoke all on function public.protect_profile_billing() from public;
revoke all on function public.protect_profile_role() from public;
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.set_listing_defaults() from public;
revoke all on function public.set_listing_seller_name() from public;

-- ------------------------------------------------------------
-- 3) Admin RPCs: already check is_admin() internally and raise on
--    failure (confirmed live -- an anon call returns "admin only"), so
--    this isn't an active hole. Still, anon never needs to reach these;
--    narrowing the grant matches admin_daily_counts, which already does
--    this in admin-upgrade.sql.
-- ------------------------------------------------------------
revoke all on function public.admin_delete_listing(bigint) from public;
grant execute on function public.admin_delete_listing(bigint) to authenticated;

revoke all on function public.admin_set_listing_status(bigint, text) from public;
grant execute on function public.admin_set_listing_status(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 4) is_banned(): only referenced from "to authenticated" insert/update/
--    delete policies on listings -- anon never needs it.
-- ------------------------------------------------------------
revoke all on function public.is_banned(uuid) from public;
grant execute on function public.is_banned(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5) mark_message_read(): called by logged-in users via
--    db.rpc("mark_message_read", ...) for their own inbox. It already
--    scopes the update to `recipient_id = auth.uid()`, so an anon caller
--    (auth.uid() is null) matches zero rows -- but anon has no business
--    reaching it at all.
-- ------------------------------------------------------------
revoke all on function public.mark_message_read(bigint) from public;
grant execute on function public.mark_message_read(bigint) to authenticated;

-- ------------------------------------------------------------
-- 6) is_admin(): INTENTIONALLY left callable by anon. The public
--    "listings: lecture publique" select policy (admin-upgrade.sql) has
--    no "to authenticated" clause -- it runs for anon too -- and its
--    USING clause calls is_admin() directly:
--      moderation_status = 'approved' or seller_id = auth.uid() or is_admin()
--    Revoking EXECUTE from anon here would break anonymous browsing of
--    the marketplace with a permission-denied error on every listings
--    query. Grants spelled out explicitly so a future pass doesn't "fix"
--    this advisor warning and take the site down.
-- ------------------------------------------------------------
grant execute on function public.is_admin() to anon, authenticated;

-- ------------------------------------------------------------
-- 7) push_subscriptions: RLS already scopes every policy to
--    auth.uid() = user_id, so anon reads/writes were already returning
--    zero rows -- but the table still had a stray PUBLIC/anon grant
--    (probably inherited from the project's original default privileges,
--    set before schema.sql narrowed later tables to "authenticated"
--    only). Match the pattern used everywhere else in the schema.
-- ------------------------------------------------------------
revoke all on public.push_subscriptions from public;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
