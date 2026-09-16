-- Buy Sell Trade SXM -- unsubscribe link for the listing-renewal reminder
-- email. This is the only automated/recurring email template in the app;
-- it had no way to opt out short of emailing support.
--
-- Run once against the linked project:
--   supabase db query --linked --file supabase/renewal-email-unsubscribe.sql

alter table public.profiles
  add column if not exists renewal_emails_enabled boolean not null default true;

-- Callable without being signed in (that's the whole point of an
-- unsubscribe link) -- but it can only ever flip ONE profile's flag, and
-- only to false, keyed by that profile's id. profiles.id is a v4 UUID
-- (Supabase auth.users id), not sequential or guessable, so knowing it is
-- the same "possession of an opaque token" security model every
-- unsubscribe link on the internet relies on. Not sensitive to leak or
-- reuse: worst case is re-disabling an already-disabled flag.
create or replace function public.unsubscribe_renewal_emails(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set renewal_emails_enabled = false where id = p_user_id;
$$;

revoke all on function public.unsubscribe_renewal_emails(uuid) from public;
grant execute on function public.unsubscribe_renewal_emails(uuid) to anon, authenticated;

-- Stop enqueueing the reminder for sellers who opted out.
create or replace function public.enqueue_listing_renewal_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
begin
  with due as (
    select l.id, l.seller_id, l.title, u.email
      from public.listings l
      join auth.users u on u.id = l.seller_id
      join public.profiles p on p.id = l.seller_id
     where l.seller_id is not null
       and coalesce(l.status, 'active') = 'active'
       and coalesce(l.expires_at, l.created_at + interval '30 days') <= now()
       and l.renewal_requested_at is null
       and coalesce(p.renewal_emails_enabled, true) = true
  ),
  notifications as (
    insert into public.app_notifications (user_id, listing_id, kind, title, body, action_required, metadata)
    select seller_id,
           id,
           'listing_renewal_required',
           'Votre annonce est-elle encore disponible ?',
           title || ' a atteint 30 jours. Choisissez: garder, vendu ou supprimer.',
           true,
           jsonb_build_object('listing_title', title)
      from due
    on conflict (user_id, listing_id, kind) where listing_id is not null do nothing
    returning id
  ),
  emails as (
    insert into public.email_queue (user_id, listing_id, recipient_email, template, subject, payload)
    select seller_id,
           id,
           email,
           'listing-renewal',
           'Votre annonce est-elle encore disponible ?',
           jsonb_build_object('listing_id', id, 'listing_title', title)
      from due
     where email is not null
       and not exists (
         select 1 from public.email_queue q
          where q.listing_id = due.id
            and q.user_id = due.seller_id
            and q.template = 'listing-renewal'
            and q.created_at > now() - interval '7 days'
       )
    returning id
  )
  update public.listings l
     set renewal_requested_at = now()
    from due
   where l.id = due.id;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke execute on function public.enqueue_listing_renewal_reminders() from public;
grant execute on function public.enqueue_listing_renewal_reminders() to service_role;
