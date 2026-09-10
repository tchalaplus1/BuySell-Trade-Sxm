/* ============================================================
 *  ADS CONFIGURATION  —  Buy Sell Trade Sxm
 * ------------------------------------------------------------
 *  This is the ONLY file you edit to control advertising.
 *  It is safe to commit: it holds no secrets (an AdSense
 *  publisher id and slot ids are public by design).
 *
 *  Priority per ad slot, decided at render time by ads.js:
 *    1. A live DIRECT-SOLD campaign  (see `campaigns` below)
 *    2. Google AdSense               (if `adsense.client` is set)
 *    3. A HOUSE promo                (your own Boost / Pro / Post CTA)
 *    4. Nothing — the slot collapses
 *
 *  Slot keys used across the site:
 *    "desktop-leaderboard"  big banner, top of page, desktop only
 *    "home-top"             mobile banner under the header
 *    "sticky-bottom"        mobile sticky banner above the tab bar
 *    "feed"                 in-list card, mobile, repeats down the grid
 * ============================================================ */
window.AdsConfig = {

  /* ---- master switch ---------------------------------------
   * false = no network ads and no house promos anywhere.
   * You can also disable per visit with ?noads=1 in the URL. */
  enabled: true,

  /* ---- Google AdSense ------------------------------------- */
  adsense: {
    /* Your publisher id, e.g. "ca-pub-1234567890123456".
     * Leave "" until AdSense has APPROVED the site — an empty
     * value means the loader script is never added. */
    client: "",

    /* One ad-unit id per slot (the 10-digit number from the
     * AdSense unit you create). Leave "" to fall back to a
     * house promo for that slot even when `client` is set. */
    slots: {
      "desktop-leaderboard": "",
      "home-top": "",
      "sticky-bottom": "",
      "feed": ""
    },

    /* Auto-ads / page-level ads. Usually leave false and use
     * the explicit slots above so layout stays controlled. */
    pageLevel: false
  },

  /* ---- Direct-sold local campaigns -----------------------
   * You sell these yourself to SXM businesses. Add an object
   * per campaign. Dates are inclusive, ISO "YYYY-MM-DD", in
   * the visitor's local time. `image` can be a repo path
   * (e.g. "/ads/acme-1200x300.jpg") or any https URL.
   *
   * Example (delete or edit):
   * {
   *   id: "acme-sept",
   *   placements: ["desktop-leaderboard", "home-top"],
   *   weight: 1,
   *   start: "2026-09-01",
   *   end:   "2026-09-30",
   *   sponsor: "ACME Rentals",
   *   url: "https://acme-sxm.example",
   *   image: "/ads/acme-1200x300.jpg",
   *   alt: { fr: "ACME Rentals — voitures dès 30€/jour",
   *          en: "ACME Rentals — cars from $32/day" },
   *   headline: { fr: "Louez une voiture à Sint Maarten",
   *               en: "Rent a car in Sint Maarten" },
   *   text: { fr: "Retrait à l'aéroport, assurance incluse.",
   *           en: "Airport pickup, insurance included." },
   *   cta: { fr: "Voir les offres", en: "See deals" }
   * }
   */
  campaigns: [],

  /* ---- House promos (fallback fill) ---------------------- */
  house: {
    enabled: true,
    /* Which promos may appear, cycled per slot. Remove any you
     * don't want. `action` maps to a function already in the app. */
    promos: [
      {
        id: "boost",
        action: "openBoostInfo",
        headline: { fr: "Mettez votre annonce en avant",
                    en: "Put your listing on top" },
        text: { fr: "Plus de vues, plus de contacts. Boost dès aujourd'hui.",
                en: "More views, more buyers. Boost it today." },
        cta: { fr: "Booster", en: "Boost now" }
      },
      {
        id: "pro",
        action: "openPricingInfo",
        headline: { fr: "Passez en compte Pro",
                    en: "Go Pro for your business" },
        text: { fr: "Page boutique, badge Pro, plus d'annonces et de visibilité.",
                en: "Shop page, Pro badge, more listings and reach." },
        cta: { fr: "Voir les offres Pro", en: "See Pro plans" }
      },
      {
        id: "post",
        action: "openPostModal",
        headline: { fr: "Vendez ce que vous n'utilisez plus",
                    en: "Sell what you no longer use" },
        text: { fr: "Publier une annonce est gratuit sur toute l'île.",
                en: "Posting a listing is free across the island." },
        cta: { fr: "Déposer une annonce", en: "Post an ad" }
      }
    ]
  },

  /* ---- Labelling & behaviour ---------------------------- */
  label: { fr: "Publicité", en: "Sponsored" },
  houseLabel: { fr: "Buy Sell Trade Sxm", en: "Buy Sell Trade Sxm" },

  /* Lazy-load distance in px before a slot scrolls into view. */
  lazyMargin: 320,

  /* Optional GA4 — only to measure traffic (helps you optimise
   * ads and is basically required for AdSense review). Paste a
   * measurement id like "G-XXXXXXX" to switch it on. */
  analytics: { ga4: "" }
};
