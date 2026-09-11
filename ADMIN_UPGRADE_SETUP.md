# Admin panel upgrade — setup

Everything below is new: a moderation queue, direct-sold ad management,
listing search + edit, user search + account deletion, and daily stats —
all inside the admin panel you already use (buyselltradesxm.com/admin/).

Three things to do, in order. #1 is required for the others to work.

## 1. Run the database migration

Supabase Dashboard → your project (`szhaxlmronirhnntlwyb`) → **SQL Editor**
→ New query → paste the entire contents of **`supabase/admin-upgrade.sql`**
→ **Run**. Safe to re-run. Run it **after** `supabase/setup.sql`.

This adds:
- `profiles.email` (so you can search/identify users — still private, admin/own-row only)
- Listing moderation: `moderation_status`, a `moderation_rules` table (admin-only), and a trigger that queues a personal listing for review only if its category or a keyword you configure matches — **Pro/business accounts always publish instantly**, per your request
- `ad_campaigns` table — the ads you sell directly, editable from the new "Publicités" admin tab instead of hand-editing `ads-config.js`
- `admin_daily_counts()` — a counts-only stats function (no message content) for the new "Statistiques" tab

Nothing changes for existing listings — they're all marked `approved` automatically.

## 2. Deploy the two Edge Functions

These need the Supabase CLI once, linked to this project.

```bash
npm install -g supabase        # if you don't have it
supabase login
supabase link --project-ref szhaxlmronirhnntlwyb
supabase functions deploy admin-delete-user
supabase functions deploy moderate-photo
```

- **`admin-delete-user`** — powers "Supprimer le compte" in the Users tab.
  No extra secrets needed (uses the project's own service key, provided
  automatically to every Edge Function).
- **`moderate-photo`** — powers "Scanner les photos (IA)" in the "À
  valider" tab. Needs AWS — see step 3. Until you do step 3, the button
  will show a clear "AWS not configured" message instead of failing silently.

If you don't have the Supabase CLI set up locally, tell me and I'll walk
you through it, or you can paste each function's code into the Dashboard
under **Edge Functions → Deploy a new function** (paste the contents of
`supabase/functions/<name>/index.ts`).

## 3. AWS Rekognition (photo AI moderation) — optional, do this when ready

1. Create an AWS account at aws.amazon.com if you don't have one.
2. AWS Console → **IAM → Users → Create user** → programmatic access →
   attach only the **`AmazonRekognitionReadOnlyAccess`** policy (least
   privilege — it can only *look at* images, not change anything in your AWS account).
3. Save the Access Key ID + Secret Access Key it gives you (shown once).
4. In a terminal with the Supabase CLI linked (step 2 above):
   ```bash
   supabase secrets set AWS_ACCESS_KEY_ID=your_key_id
   supabase secrets set AWS_SECRET_ACCESS_KEY=your_secret_key
   supabase secrets set AWS_REGION=us-east-1
   supabase functions deploy moderate-photo
   ```
5. Cost: first 5,000 images/month free, then roughly $1 per 1,000 — you
   only pay for photos an admin actually clicks "Scan" on (it's not automatic).

## How it works day to day

- **Moderation ("À valider" tab):** personal listings only get queued if
  they hit a category or keyword you set in the rules box at the bottom of
  that tab. Leave both empty and nothing is queued — you opt in category
  by category. Pro accounts skip the queue entirely.
- **Ads ("Publicités" tab):** click "+ Ajouter une pub", fill in the
  fields, tick which placements it should run in, set start/end dates,
  Save. It shows up on the live site within moments and stops itself
  after the end date — no code, no redeploy.
- **Users tab:** search by name or email; "Supprimer le compte" is
  permanent (their listings stay but lose their seller and show as
  "Example"; their messages are removed) — a confirmation dialog protects
  against misclicks, and you can't delete your own account this way.
- **Statistiques tab:** last 14 days of new listings / new accounts /
  messages sent — counts only, no message content is ever read.
