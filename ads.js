/* ============================================================
 *  ads.js — advertising manager for Buy Sell Trade Sxm
 * ------------------------------------------------------------
 *  Reads window.AdsConfig (ads-config.js) and fills every ad
 *  slot on the page. Per slot, in order:
 *     1. a live direct-sold campaign
 *     2. Google AdSense (if a publisher id + unit id are set)
 *     3. a house promo (Boost / Pro / Post)
 *     4. nothing — the slot is hidden
 *
 *  No external dependencies. Safe to load with `defer`.
 *  Disable per visit with ?noads=1  (persists for the tab).
 * ============================================================ */
(function () {
  "use strict";

  var CFG = window.AdsConfig || null;

  // ---- kill switches -----------------------------------------------------
  var OFF = false;
  try {
    var qs = new URLSearchParams(location.search || "");
    if (qs.has("noads")) { sessionStorage.setItem("bst_noads", "1"); }
    if (qs.has("ads")) { sessionStorage.removeItem("bst_noads"); }
    if (sessionStorage.getItem("bst_noads") === "1") OFF = true;
  } catch (e) {}
  if (!CFG || CFG.enabled === false) OFF = true;

  // ---- helpers ---------------------------------------------------------
  function lang() {
    try {
      return (localStorage.getItem("bst_lang") ||
              document.documentElement.lang || "fr").slice(0, 2).toLowerCase();
    } catch (e) { return "fr"; }
  }
  function L(obj) {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    return obj[lang()] || obj.fr || obj.en || "";
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function normKey(node) {
    var k = node.getAttribute("data-ad-placement") ||
            node.getAttribute("data-admob-placement") || "";
    if (k.indexOf("feed") === 0) return "feed";
    return k;
  }

  // ---- lightweight event tracking ------------------------------------
  function track(name, params) {
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, params || {});
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent("bst:ad", { detail: Object.assign({ name: name }, params || {}) }));
    } catch (e) {}
  }

  // ---- GA4 (optional, traffic measurement only) ---------------------
  function ensureGA() {
    var id = CFG && CFG.analytics && CFG.analytics.ga4;
    if (!id || window.__bstGA) return;
    window.__bstGA = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true });
  }

  // ---- AdSense loader ------------------------------------------------
  var adsenseState = "idle"; // idle | loading | ready | failed
  function ensureAdsense(cb) {
    var client = CFG && CFG.adsense && CFG.adsense.client;
    if (!client) { if (cb) cb(false); return; }
    // Always request contextual, non-personalized ads, before loading Google
    // and before each unit request. This does not replace a consent platform.
    (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;
    if (adsenseState === "ready") { if (cb) cb(true); return; }
    if (adsenseState === "failed") { if (cb) cb(false); return; }
    if (adsenseState === "loading") {
      document.addEventListener("bst:adsense", function h() {
        document.removeEventListener("bst:adsense", h);
        if (cb) cb(adsenseState === "ready");
      });
      return;
    }
    adsenseState = "loading";
    var s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
            encodeURIComponent(client);
    s.onload = function () {
      adsenseState = "ready";
      if (CFG.adsense.pageLevel) {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      }
      document.dispatchEvent(new Event("bst:adsense"));
      if (cb) cb(true);
    };
    s.onerror = function () {
      adsenseState = "failed";
      document.dispatchEvent(new Event("bst:adsense"));
      if (cb) cb(false);
    };
    document.head.appendChild(s);
  }

  // ---- pickers -----------------------------------------------------
  function pickCampaign(key) {
    var list = (CFG.campaigns || []).filter(function (c) {
      if (!c || !c.url) return false;
      if (!(c.placements || []).some(function (p) { return p === key; })) return false;
      var t = todayStr();
      if (c.start && c.start > t) return false;
      if (c.end && c.end < t) return false;
      return (c.weight == null ? 1 : c.weight) > 0;
    });
    if (!list.length) return null;
    var total = list.reduce(function (s, c) { return s + (c.weight == null ? 1 : c.weight); }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < list.length; i++) {
      r -= (list[i].weight == null ? 1 : list[i].weight);
      if (r <= 0) return list[i];
    }
    return list[0];
  }

  var slotOrdinal = 0;
  function pickHouse() {
    var promos = (CFG.house && CFG.house.enabled && CFG.house.promos) || [];
    if (!promos.length) return null;
    var seed = Math.floor(Date.now() / 1800000); // rotates every 30 min
    return promos[(seed + slotOrdinal++) % promos.length];
  }

  // ---- renderers -------------------------------------------------
  function flag(text, cls) {
    var f = el("span", "ad-flag" + (cls ? " " + cls : ""), text);
    return f;
  }

  function renderCampaign(container, key, c) {
    var a = el("a", "ad-unit ad-campaign");
    a.href = c.url;
    a.target = "_blank";
    a.rel = "sponsored noopener nofollow";
    a.setAttribute("data-ad-id", c.id || "");
    a.appendChild(flag(L(CFG.label) || "Sponsored"));
    if (c.image) {
      var img = el("img", "ad-media");
      img.src = c.image;
      img.alt = L(c.alt) || c.sponsor || "";
      img.loading = "lazy";
      a.appendChild(img);
    }
    if (L(c.headline) || L(c.text)) {
      var body = el("span", "ad-body");
      if (L(c.headline)) body.appendChild(el("strong", "ad-head", L(c.headline)));
      if (L(c.text)) body.appendChild(el("span", "ad-text", L(c.text)));
      if (L(c.cta)) body.appendChild(el("span", "ad-cta", L(c.cta)));
      a.appendChild(body);
    }
    if (c.sponsor) a.appendChild(el("span", "ad-sponsor", c.sponsor));
    a.addEventListener("click", function () {
      track("ad_click", { slot: key, type: "campaign", id: c.id });
    });
    mount(container, a, "campaign", c.id);
    track("ad_impression", { slot: key, type: "campaign", id: c.id });
  }

  function renderHouse(container, key, promo) {
    if (!promo) { collapse(container); return; }
    var b = el("button", "ad-unit ad-house");
    b.type = "button";
    b.appendChild(flag(L(CFG.houseLabel) || "Buy Sell Trade Sxm", "ad-flag-house"));
    var body = el("span", "ad-body");
    body.appendChild(el("strong", "ad-head", L(promo.headline)));
    body.appendChild(el("span", "ad-text", L(promo.text)));
    body.appendChild(el("span", "ad-cta", L(promo.cta) + " ›"));
    b.appendChild(body);
    b.addEventListener("click", function () {
      track("ad_click", { slot: key, type: "house", id: promo.id });
      var fn = window[promo.action];
      if (typeof fn === "function") { try { fn(); } catch (e) {} }
    });
    mount(container, b, "house", promo.id);
    track("ad_impression", { slot: key, type: "house", id: promo.id });
  }

  function renderAdsense(container, key, unit) {
    var client = CFG.adsense.client;
    var wrap = el("span", "ad-unit ad-network");
    wrap.appendChild(flag(L(CFG.label) || "Sponsored"));
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", client);
    ins.setAttribute("data-ad-slot", unit);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    wrap.appendChild(ins);
    mount(container, wrap, "network", unit);
    ensureAdsense(function (ok) {
      if (!ok) { renderHouse(container, key, pickHouse()); return; }
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      // fall back to a house promo if AdSense returns no ad
      setTimeout(function () {
        if (ins.getAttribute("data-ad-status") === "unfilled" ||
            (ins.getBoundingClientRect().height < 8 && ins.getAttribute("data-ad-status") !== "filled")) {
          renderHouse(container, key, pickHouse());
        } else {
          track("ad_impression", { slot: key, type: "network" });
        }
      }, 4000);
    });
  }

  // ---- container plumbing --------------------------------------
  function mount(container, node, type, id) {
    container.innerHTML = "";
    container.appendChild(node);
    container.classList.add("ad-managed");
    container.setAttribute("data-ad-state", "filled");
    container.setAttribute("data-ad-kind", type);
    if (id) container.setAttribute("data-ad-fill", id);
    container.hidden = false;
  }
  function collapse(container) {
    container.innerHTML = "";
    container.setAttribute("data-ad-state", "empty");
    container.hidden = true;
  }

  function fill(container) {
    if (container.getAttribute("data-ad-state") === "filled") return;
    var key = normKey(container);
    if (!key) { collapse(container); return; }

    var c = pickCampaign(key);
    if (c) { renderCampaign(container, key, c); return; }

    var unit = CFG.adsense && CFG.adsense.client &&
               CFG.adsense.slots && CFG.adsense.slots[key];
    if (unit) { renderAdsense(container, key, unit); return; }

    if (CFG.house && CFG.house.enabled) { renderHouse(container, key, pickHouse()); return; }

    collapse(container);
  }

  // ---- discovery + lazy load ---------------------------------
  var io = null;
  function observer() {
    if (io) return io;
    var margin = (CFG && CFG.lazyMargin) || 320;
    io = ("IntersectionObserver" in window)
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { io.unobserve(en.target); fill(en.target); }
          });
        }, { rootMargin: margin + "px 0px" })
      : { observe: fill, unobserve: function () {} };
    return io;
  }

  function nearViewport(node) {
    var r = node.getBoundingClientRect();
    var m = ((CFG && CFG.lazyMargin) || 320);
    var vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.width === 0 && r.height === 0 && node.offsetParent === null) return false; // display:none
    return r.top < vh + m && r.bottom > -m;
  }

  function scan(root) {
    (root || document).querySelectorAll(
      "[data-ad-placement], [data-admob-placement]"
    ).forEach(function (node) {
      if (node.getAttribute("data-ad-state")) return;
      node.setAttribute("data-ad-state", "pending");
      node.innerHTML = "";          // drop any static placeholder markup;
                                    // an empty slot collapses to ~0px until filled,
                                    // but keeps a box so IntersectionObserver can see it
      // Fill straight away if it's already on/near screen; otherwise lazy-load.
      if (nearViewport(node)) { fill(node); return; }
      observer().observe(node);
    });
  }

  // Re-scan the results grid when the app re-renders it.
  function watchGrid() {
    var grid = document.getElementById("grid");
    if (!grid || !("MutationObserver" in window)) return;
    var timer = null;
    new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () { scan(grid); }, 200);
    }).observe(grid, { childList: true });
  }

  // Language toggle → re-render campaign/house copy (not network units).
  function watchLang() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".lang button");
      if (!b) return;
      setTimeout(function () {
        slotOrdinal = 0;
        document.querySelectorAll('[data-ad-kind="house"], [data-ad-kind="campaign"]').forEach(function (n) {
          n.removeAttribute("data-ad-state");
          n.removeAttribute("data-ad-kind");
          fill(n);
        });
      }, 60);
    }, true);
  }

  // ---- boot ---------------------------------------------------
  function boot() {
    if (OFF) {
      document.querySelectorAll("[data-ad-placement], [data-admob-placement]").forEach(collapse);
      return;
    }
    ensureGA();
    if (CFG.adsense && CFG.adsense.client && CFG.adsense.pageLevel) ensureAdsense();
    injectCSS();
    scan(document);
    watchGrid();
    watchLang();
  }

  window.Ads = {
    refresh: function () { slotOrdinal = 0; scan(document); },
    config: function () { return CFG; },
    track: track
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // ---- styling (kept with the logic to minimise HTML churn) --
  function injectCSS() {
    if (document.getElementById("ads-css")) return;
    var s = document.createElement("style");
    s.id = "ads-css";
    s.textContent = [
      ".ad-managed{border:0!important;background:none!important;padding:0!important;}",
      '.ad-managed[data-ad-state="filled"]{margin-block:10px;}',
      /* pending: keep a (0px) box so lazy-load can observe it, but show nothing */
      '[data-ad-state="pending"]{border:0!important;background:none!important;padding:0!important;min-height:0!important;}',
      '[data-ad-state="pending"] *{display:none!important;}',
      '[data-ad-state="empty"]{display:none!important;}',
      ".ad-unit{position:relative;display:flex;flex-direction:column;gap:6px;",
      "  width:100%;text-align:left;border:1.5px solid rgba(19,42,46,.18);border-radius:14px;",
      "  background:var(--white,#fff);padding:14px 16px;color:var(--ink,#132a2e);",
      "  font:inherit;cursor:pointer;overflow:hidden;text-decoration:none;}",
      ".ad-unit:hover{border-color:var(--sea,#0a7d8c);}",
      ".ad-flag{align-self:flex-start;font-size:9px;font-weight:900;letter-spacing:.08em;",
      "  text-transform:uppercase;color:var(--mute,#5b6b6e);border:1px solid rgba(19,42,46,.2);",
      "  border-radius:5px;padding:2px 5px;background:rgba(19,42,46,.03);}",
      ".ad-flag-house{color:var(--sea,#0a7d8c);border-color:var(--sea,#0a7d8c);}",
      ".ad-media{width:100%;max-height:140px;object-fit:cover;border-radius:9px;display:block;}",
      ".ad-body{display:flex;flex-direction:column;gap:3px;}",
      ".ad-head{font-family:'Space Grotesk',sans-serif;font-size:16px;line-height:1.15;}",
      ".ad-text{font-size:12.5px;line-height:1.35;color:var(--mute,#5b6b6e);font-weight:600;}",
      ".ad-cta{margin-top:4px;font-size:12.5px;font-weight:900;color:var(--sea-deep,#0a5a66);}",
      ".ad-sponsor{font-size:10.5px;font-weight:700;color:var(--mute,#5b6b6e);}",
      ".ad-network{padding:8px;}",
      ".ad-network .adsbygoogle{min-height:90px;}",
      /* desktop leaderboard: horizontal band */
      "@media(min-width:901px){",
      "  .desktop-leaderboard-ad .ad-unit{flex-direction:row;align-items:center;gap:18px;min-height:120px;padding:16px 20px;}",
      "  .desktop-leaderboard-ad .ad-media{width:220px;height:104px;max-height:none;flex:none;}",
      "  .desktop-leaderboard-ad .ad-flag{position:absolute;right:12px;top:12px;}",
      "  .desktop-leaderboard-ad .ad-head{font-size:20px;}",
      "  .desktop-leaderboard-ad .ad-body{flex:1;}",
      "}"
    ].join("");
    document.head.appendChild(s);
  }
})();
