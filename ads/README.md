# Direct-sold ad creatives

Drop advertiser images here and reference them from `ads-config.js` →
`campaigns[]` as `image: "/ads/filename.jpg"`.

## How to sell and publish a banner

1. Agree a price and dates with the business (flat fee per week/month).
2. Get their creative, or make one. Recommended sizes:
   - **Leaderboard / content band (`desktop-leaderboard`, `content-1`)**:
     1200 × 300 px, JPG or PNG, < 200 KB. Shown as a wide strip on desktop.
   - **Mobile / in-feed / listing-detail**: the same image is reused,
     cropped to fit. A 1200 × 628 px image also works well.
   - Keep important text away from the edges; a "Sponsored" label is added
     automatically in the top corner.
3. Save it here, e.g. `ads/acme-1200x300.jpg`.
4. In `ads-config.js`, copy the `example-disabled` block in `campaigns`,
   then:
   - `id`: a unique short slug
   - `weight`: `1`
   - `placements`: which slots to run in (`desktop-leaderboard`,
     `content-1`, `home-top`, `feed`, `listing-detail`)
   - `start` / `end`: `"YYYY-MM-DD"`, inclusive
   - `sponsor`, `url`, `image`, `alt`, `headline`, `text`, `cta`
5. Commit + push. It appears within a minute and stops itself after `end`.

If several campaigns target the same slot, they rotate by `weight`.
A campaign always beats AdSense and house promos for that slot.

## Proof of delivery

Every view and click fires an event (`ad_impression` / `ad_click` with the
campaign `id`). With GA4 enabled you can pull a simple report for the
advertiser.
