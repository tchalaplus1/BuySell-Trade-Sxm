-- ============================================================
--  Make yourself an admin — Buy Sell Trade Sxm
--  Project: szhaxlmronirhnntlwyb  (Supabase Dashboard > SQL Editor)
-- ------------------------------------------------------------
--  ORDER:
--   1. Sign up in the live app first (https://buyselltradesxm.com)
--      with the email you want to be admin.
--   2. Make sure supabase/setup.sql has been run at least once on
--      this project (it creates profiles.role, is_admin(), the
--      moderation tables, and the profile-creation trigger).
--   3. Edit the email on BOTH lines below, then run this file.
--
--  Running from the SQL Editor bypasses the role-change guard
--  (auth.uid() is null here), so this works even though the app
--  would normally block a self-promotion.
-- ============================================================

insert into public.profiles (id, role)
select u.id, 'admin'
from auth.users u
where u.email = 'rxmarketing09@gmail.com'      -- <<< your signup email
on conflict (id) do update set role = 'admin';

-- confirm it worked (should return one row with role = admin)
select p.id, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'rxmarketing09@gmail.com';      -- <<< same email
