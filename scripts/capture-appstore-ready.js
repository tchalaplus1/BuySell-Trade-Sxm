const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outPhone = path.join(process.cwd(), 'appstore-screenshots-ready', 'iphone-65');
const outPad = path.join(process.cwd(), 'appstore-screenshots-ready', 'ipad-13');
fs.mkdirSync(outPhone, { recursive: true });
fs.mkdirSync(outPad, { recursive: true });

async function prep(page) {
  await page.goto('file:///C:/Users/PC/Desktop/Buy Sell Trade Sxm/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    try { localStorage.setItem('bst_lang', 'en'); } catch(e) {}
    if (typeof setLang === 'function') setLang('en');
    document.body.style.overflow = 'hidden';
  });
  await page.waitForTimeout(800);
}

async function shot(page, file) {
  await page.screenshot({ path: file, fullPage: false, type: 'jpeg', quality: 92 });
  console.log(file);
}

async function captureSet(browser, size, outDir) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: false });
  const page = await context.newPage();
  await prep(page);
  await shot(page, path.join(outDir, '01-browse-marketplace.jpg'));

  const cat = page.getByText('Vehicles', { exact: false }).first();
  if (await cat.count()) { await cat.click().catch(()=>{}); await page.waitForTimeout(700); }
  await shot(page, path.join(outDir, '02-vehicles-category.jpg'));

  const listing = page.locator('[data-listing-id], .listing-card, .card').first();
  if (await listing.count()) { await listing.click().catch(()=>{}); await page.waitForTimeout(700); }
  await shot(page, path.join(outDir, '03-listing-detail.jpg'));

  await page.goto('file:///C:/Users/PC/Desktop/Buy Sell Trade Sxm/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.setItem('bst_lang','en'); } catch(e) {} if (typeof setLang === 'function') setLang('en'); document.body.style.overflow='hidden'; });
  await page.waitForTimeout(500);
  const post = page.getByText(/post|sell|list/i).first();
  if (await post.count()) { await post.click().catch(()=>{}); await page.waitForTimeout(700); }
  await shot(page, path.join(outDir, '04-post-listing.jpg'));
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  await captureSet(browser, { width: 1284, height: 2778 }, outPhone);
  await captureSet(browser, { width: 2064, height: 2752 }, outPad);
  await browser.close();
})();

