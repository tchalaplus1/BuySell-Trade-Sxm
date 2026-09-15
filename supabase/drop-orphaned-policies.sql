-- Buy Sell Trade SXM -- drop orphaned/duplicate RLS policies found live on
-- production 2026-09-15 via `select * from pg_policies` that don't match
-- anything in this repo's tracked .sql files (English snake_case names,
-- vs. this repo's French colon-style names -- they came from somewhere
-- else, most likely one-off Dashboard SQL editor runs).
--
-- Postgres RLS policies for the same command are OR'd together
-- (permissive by default), so the least restrictive one always wins.
--
-- CRITICAL: "listings_public_read" (qual: true, role: public) coexists
-- with the intentional "listings: lecture publique" policy (gated on
-- moderation_status = 'approved' or own or admin, from admin-upgrade.sql).
-- Because of the OR-combination, the unconditional "true" policy wins --
-- meaning ANY listing, including ones a moderation rule flags as
-- 'pending', is currently readable by anyone. This is invisible today
-- only because moderation_rules (categories/keywords) is still empty --
-- the moment an admin configures a single rule from the admin panel,
-- flagged listings would leak to the public despite the moderation gate.
-- Verified structurally via live `pg_policies`, not just empirically
-- (current test data has zero non-approved rows to observe the leak
-- with).
--
-- Run once against the linked project:
--   supabase db query --linked --file supabase/drop-orphaned-policies.sql

-- ------------------------------------------------------------
-- THE ACTUAL FIX -- everything else below is hygiene only.
-- ------------------------------------------------------------
drop policy if exists "listings_public_read" on public.listings;

-- ------------------------------------------------------------
-- Hygiene: exact-duplicate policies (same effective condition as an
-- existing, correctly-scoped policy). None of these widen access on
-- their own, but duplicate policies are exactly how the listings bug
-- above happened -- two similarly-named policies drift out of sync
-- over separate migration passes and nobody notices because both
-- "work" until one of them is written more loosely than intended.
-- Fewer, single-sourced policies per table make that class of bug
-- harder to reintroduce.
-- ------------------------------------------------------------
drop policy if exists "listings_insert_own" on public.listings;
drop policy if exists "listings_update_own" on public.listings;
drop policy if exists "listings_delete_own" on public.listings;
drop policy if exists "listings_admin_all" on public.listings;

drop policy if exists "admin_events_admin_all" on public.admin_events;
drop policy if exists "admin_settings_admin_all" on public.admin_settings;
drop policy if exists "admin_settings_public_read" on public.admin_settings;
drop policy if exists "banned_users_admin_all" on public.banned_users;
drop policy if exists "messages_participant_read" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;
drop policy if exists "profiles_select_own_admin" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "profiles_manage_own" on public.profiles;
drop policy if exists "reports_admin_all" on public.reports;
drop policy if exists "reports_insert_own" on public.reports;
