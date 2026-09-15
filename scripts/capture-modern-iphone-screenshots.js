const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const root = process.cwd();
// file:// has no real origin: fetch()/localStorage/CORS behave differently
// than on the deployed site and can leave the page's own JS retrying network
// calls forever. Serve over http instead (e.g. `npx serve -l 4173 .`).
const appUrl = process.env.APPSTORE_SHOT_URL || 'http://localhost:4173/';
const outRoot = path.join(root, 'appstore-screenshots-ready');
const PER_DEVICE_TIMEOUT_MS = 90000;

// `width`/`height` are the exact pixel dimensions Apple requires for each
// screenshot bucket. The viewport passed to Playwright must be in CSS
// points (cssWidth/cssHeight) with a matching deviceScaleFactor — the site's
// mobile layout (.mobile-nav, single-column grid, etc.) only switches on
// under `max-width:900px` (index.html), so a viewport set to the raw pixel
// width (e.g. 1320px) never triggers it and renders the desktop layout
// instead. cssWidth * scale === width (and same for height) for every entry.
const devices = [
  { key: 'iphone-13-6-1', width: 1170, height: 2532, cssWidth: 390, cssHeight: 844, scale: 3, isMobile: true },
  { key: 'iphone-13-pro-max-6-7', width: 1284, height: 2778, cssWidth: 428, cssHeight: 926, scale: 3, isMobile: true },
  { key: 'iphone-14-pro-15-pro-6-1', width: 1179, height: 2556, cssWidth: 393, cssHeight: 852, scale: 3, isMobile: true },
  { key: 'iphone-15-pro-max-16-plus-6-7', width: 1290, height: 2796, cssWidth: 430, cssHeight: 932, scale: 3, isMobile: true },
  { key: 'iphone-16-pro-max-6-9-appstore', width: 1320, height: 2868, cssWidth: 440, cssHeight: 956, scale: 3, isMobile: true },
  // iPad 13" stays above the 900px breakpoint on purpose — that's the real
  // desktop-style layout the app shows on a tablet-sized screen.
  { key: 'ipad-13-appstore', width: 2064, height: 2752, cssWidth: 1032, cssHeight: 1376, scale: 2, isMobile: false },
];

async function waitForVisuals(page) {
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 2500);
    })));
  }).catch(() => {});
  await page.waitForTimeout(800);
}

async function prepare(page) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    if (typeof setLang === 'function') setLang('en');
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.overflow = 'hidden';
  });
  await waitForVisuals(page);
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const loc = selector.kind === 'text'
      ? page.getByText(selector.value, selector.options || {}).first()
      : page.locator(selector.value).first();
    if (await loc.count()) {
      try { await loc.click({ timeout: 2000 }); await waitForVisuals(page); return true; } catch(e) {}
    }
  }
  return false;
}

async function captureDevice(context, device) {
  const out = path.join(outRoot, device.key);
  fs.mkdirSync(out, { recursive: true });
  const page = await context.newPage();
  page.on('console', msg => console.log(`  [${device.key}] console:`, msg.text()));
  page.on('pageerror', err => console.log(`  [${device.key}] pageerror:`, err.message));

  await prepare(page);
  await page.screenshot({ path: path.join(out, '01-browse-marketplace.jpg'), type: 'jpeg', quality: 92, fullPage: false });

  await clickFirst(page, [
    { kind: 'text', value: 'Vehicles', options: { exact: false } },
    { kind: 'css', value: '[data-cat="vehicles"]' },
    { kind: 'css', value: 'button:has-text("Vehicles")' },
  ]);
  await page.screenshot({ path: path.join(out, '02-vehicles-category.jpg'), type: 'jpeg', quality: 92, fullPage: false });

  await clickFirst(page, [
    { kind: 'css', value: '[data-listing-id]' },
    { kind: 'css', value: '.listing-card' },
    { kind: 'css', value: '.card' },
  ]);
  await page.screenshot({ path: path.join(out, '03-listing-detail.jpg'), type: 'jpeg', quality: 92, fullPage: false });

  await prepare(page);
  await clickFirst(page, [
    { kind: 'text', value: 'Post an ad', options: { exact: false } },
    { kind: 'text', value: 'Post', options: { exact: false } },
    { kind: 'text', value: 'Sell', options: { exact: false } },
  ]);
  await page.screenshot({ path: path.join(out, '04-post-listing.jpg'), type: 'jpeg', quality: 92, fullPage: false });

  await prepare(page);
  await clickFirst(page, [
    { kind: 'text', value: 'Pricing', options: { exact: false } },
    { kind: 'text', value: 'Promote', options: { exact: false } },
  ]);
  await page.screenshot({ path: path.join(out, '05-pricing-boosts.jpg'), type: 'jpeg', quality: 92, fullPage: false });

  console.log(`${device.key}\t${device.width}x${device.height}\t${out}`);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const device of devices) {
    const context = await browser.newContext({
      viewport: { width: device.cssWidth, height: device.cssHeight },
      deviceScaleFactor: device.scale,
      isMobile: device.isMobile,
      hasTouch: device.isMobile
    });
    // Runs before any page script, including consent.js's own
    // DOMContentLoaded listener — so its "already chosen" check always sees
    // this value and the #bst-consent notice never renders (a post-load
    // evaluate() would race consent.js's polling and could still flash it).
    await context.addInitScript(() => {
      try {
        localStorage.setItem('bst_lang', 'en');
        localStorage.setItem('bst_consent', 'granted');
      } catch (e) {}
    });
    try {
      await withTimeout(captureDevice(context, device), PER_DEVICE_TIMEOUT_MS, device.key);
    } catch (e) {
      console.log(`  [${device.key}] FAILED: ${e.message}`);
    } finally {
      // Always close, even on timeout — this aborts any in-flight page work
      // for this device instead of letting it keep running (and competing
      // for CPU/network) alongside the next device's context.
      await context.close().catch(() => {});
    }
  }
  await browser.close();
})();
