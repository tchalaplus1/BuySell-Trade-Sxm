-- ============================================================
--  Buy Sell Trade Sxm — Admin upgrade (full control)
--  Project: szhaxlmronirhnntlwyb
--  Run in: Supabase Dashboard > SQL Editor > New query > paste all > Run
--  Idempotent — safe to re-run. Run AFTER supabase/setup.sql.
-- ============================================================

-- ------------------------------------------------------------
--  1) profiles.email — so admin can search/identify users.
--     (profiles is already admin/own-row-only readable, so this
--     does not make emails public.)
-- ------------------------------------------------------------
alter table profiles add column if not exists email text;

update profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and p.email is distinct from u.email;

-- Keep it in sync on signup, alongside the existing admin auto-promote.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    case when lower(new.email) = 'rxmarketing09@gmail.com' then 'admin' else 'user' end
  )
  on conflict (id) do update
  set name = coalesce(public.profiles.name, excluded.name),
      email = excluded.email,
      role = case
        when lower(new.email) = 'rxmarketing09@gmail.com' then 'admin'
        else public.profiles.role
      end;
  return new;
end;
$$;

-- ------------------------------------------------------------
--  2) Listing moderation — pending review before it's public,
--     unless the seller is an active Pro/business account.
--     Configurable via `moderation_rules` (admin-only table):
--     flag a whole category, or flag by keyword in title/description.
--     Nothing is flagged until you fill this table in from the
--     admin panel, so existing behaviour is unchanged until then.
-- ------------------------------------------------------------
alter table listings add column if not exists moderation_status text default 'approved';
update listings set moderation_status = 'approved' where moderation_status is null;

create table if not exists moderation_rules (
  id         boolean primary key default true check (id),  -- singleton row
  categories text[] not null default '{}',
  keywords   text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);
insert into moderation_rules (id) values (true) on conflict (id) do nothing;

alter table moderation_rules enable row level security;
drop policy if exists "moderation_rules: admin uniquement" on moderation_rules;
create policy "moderation_rules: admin uniquement"
  on moderation_rules for all to authenticated
  using (is_admin()) with check (is_admin());
-- Deliberately NO public/anon policy: if the rules (banned keywords) were
-- readable, a bad actor could read them to word listings around them.

create or replace function compute_listing_moderation_status(
  p_category text, p_title text, p_description text, p_seller_id uuid
) returns text language plpgsql stable security definer set search_path = public as $$
declare
  is_pro   boolean;
  cats     text[];
  kws      text[];
  kw       text;
  haystack text;
begin
  select (account_type = 'business' and coalesce(subscription_status, '') = 'active')
    into is_pro
    from public.profiles
   where id = p_seller_id;
  if coalesce(is_pro, false) then
    return 'approved';   -- Pro sellers are never queued.
  end if;

  select categories, keywords into cats, kws
    from public.moderation_rules where id = true;

  if cats is not null and p_category = any(cats) then
    return 'pending';
  end if;

  haystack := lower(coalesce(p_title, '') || ' ' || coalesce(p_description, ''));
  if kws is not null then
    foreach kw in array kws loop
      if length(trim(kw)) > 0 and haystack like '%' || lower(trim(kw)) || '%' then
        return 'pending';
      end if;
    end loop;
  end if;

  return 'approved';
end;
$$;

create or replace function set_listing_moderation_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.moderation_status := compute_listing_moderation_status(new.category, new.title, new.description, new.seller_id);
  elsif tg_op = 'UPDATE' and not is_admin() then
    -- A non-admin can NEVER write moderation_status directly — whether or
    -- not they also touch title/description/category in the same
    -- statement. Recompute on a watched-field edit; otherwise pin it back
    -- to the existing value, discarding whatever the client sent. Admin
    -- edits (incl. approve/reject from the moderation queue) are never
    -- overridden here, since this whole branch is skipped for is_admin().
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.category is distinct from old.category then
      new.moderation_status := compute_listing_moderation_status(new.category, new.title, new.description, new.seller_id);
    else
      new.moderation_status := old.moderation_status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_listing_moderation_status_trigger on listings;
create trigger set_listing_moderation_status_trigger
  before insert or update on listings
  for each row execute function set_listing_moderation_status();

-- Public can only see approved listings; the seller always sees their own
-- (pending/rejected included); admin sees everything.
drop policy if exists "listings: lecture publique" on listings;
create policy "listings: lecture publique"
  on listings for select
  using (
    moderation_status = 'approved'
    or seller_id = auth.uid()
    or is_admin()
  );

-- ------------------------------------------------------------
--  3) Direct-sold ad campaigns — manageable from the admin panel
--     instead of editing ads-config.js by hand. Publicly readable
--     (it's an ad meant to be shown), only admin can write.
-- ------------------------------------------------------------
create table if not exists ad_campaigns (
  id           text primary key,
  active       boolean not null default true,
  placements   text[] not null default '{}',
  weight       integer not null default 1,
  start_date   date,
  end_date     date,
  sponsor      text,
  url          text not null,
  image        text,
  alt_fr       text, alt_en       text,
  headline_fr  text, headline_en  text,
  text_fr      text, text_en      text,
  cta_fr       text, cta_en       text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table ad_campaigns enable row level security;

drop policy if exists "ad_campaigns: lecture publique" on ad_campaigns;
create policy "ad_campaigns: lecture publique"
  on ad_campaigns for select using (true);

drop policy if exists "ad_campaigns: admin gere tout" on ad_campaigns;
create policy "ad_campaigns: admin gere tout"
  on ad_campaigns for all to authenticated
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
--  4) Daily stats RPC — counts only (no message content), so the
--     admin dashboard can show "how many today/this week" without
--     ever reading anyone's messages.
-- ------------------------------------------------------------
create or replace function admin_daily_counts(days integer default 14)
returns table (day date, new_listings bigint, new_users bigint, new_messages bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;
  return query
  select d::date as day,
    (select count(*) from public.listings   l where l.created_at::date = d::date) as new_listings,
    (select count(*) from public.profiles   p where p.created_at::date = d::date) as new_users,
    (select count(*) from public.messages   m where m.created_at::date = d::date) as new_messages
  from generate_series(current_date - (greatest(days,1) - 1), current_date, interval '1 day') as d
  order by d desc;
end;
$$;

grant select, insert, update, delete on public.ad_campaigns to authenticated;
grant select, insert, update, delete on public.moderation_rules to authenticated;

-- ------------------------------------------------------------
--  5) Close the EXECUTE-to-PUBLIC gap Postgres applies to every new
--     function by default (unlike tables, which grant nothing to PUBLIC
--     automatically). Without this, anyone — no login required — can
--     call these as RPCs directly:
--       - compute_listing_moderation_status: turns your keyword/category
--         rules into an oracle (probe title/category combos, read back
--         'approved' vs 'pending', and word real listings around them —
--         exactly what the admin-only moderation_rules RLS was meant to
--         prevent).
--       - admin_daily_counts: now also re-checks is_admin() itself above,
--         but revoking PUBLIC here too is defense in depth.
-- ------------------------------------------------------------
revoke all on function compute_listing_moderation_status(text, text, text, uuid) from public;
revoke all on function set_listing_moderation_status() from public;
revoke all on function admin_daily_counts(integer) from public;
grant execute on function admin_daily_counts(integer) to authenticated;
