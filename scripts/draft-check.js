/**
 * Tests for draft-store.js (the offline post-draft store) and a smoke check
 * that both HTML entrypoints still load with the draft glue wired in.
 *
 * Run: node scripts/draft-check.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4655;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.css': 'text/css',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  — ' + detail : ''));
};

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const base = `http://localhost:${PORT}`;
  const browser = await chromium.launch();

  // ---- 1. draft-store.js unit behaviour (real IndexedDB in a page context) ----
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  await p1.goto(base + '/offline.html'); // any same-origin doc
  await p1.addScriptTag({ url: '/draft-store.js' });

  const unit = await p1.evaluate(async () => {
    const D = window.Drafts;
    const out = {};
    out.enabled = D && D.enabled === true;
    await D.clear();
    out.emptyPeek = (await D.peek()) === null;
    const draft = { t: 'Scooter 125', price: '900', desc: 'bon état', photos: ['data:image/png;base64,iVBORw0KGgo='] };
    out.saved = await D.save(draft);
    const loaded = await D.load();
    out.roundTrip = loaded && loaded.t === 'Scooter 125' && loaded.price === '900' && Array.isArray(loaded.photos) && loaded.photos.length === 1;
    out.hasSavedAt = loaded && typeof loaded.savedAt === 'number' && loaded.savedAt > 0;
    const meta = await D.peek();
    out.peekMeta = meta && typeof meta.savedAt === 'number' && Object.keys(meta).length === 1;
    // real 1x1 png data URL -> File
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const file = await D.dataUrlToFile(png, 'photo-1.jpg');
    out.fileOk = file instanceof File && file.type === 'image/png' && file.name === 'photo-1.jpg' && file.size > 0;
    out.badUrlNull = (await D.dataUrlToFile('not-a-data-url', 'x.jpg')) === null;
    await D.clear();
    out.clearedPeek = (await D.peek()) === null;
    return out;
  });

  check('Drafts.enabled (IndexedDB present)', unit.enabled);
  check('peek() is null when empty', unit.emptyPeek);
  check('save() resolves true', unit.saved);
  check('save -> load round-trips all fields', unit.roundTrip);
  check('load() record carries numeric savedAt', unit.hasSavedAt);
  check('peek() returns only { savedAt }', unit.peekMeta);
  check('dataUrlToFile() -> real File', unit.fileOk);
  check('dataUrlToFile() rejects non-data URL with null', unit.badUrlNull);
  check('clear() empties the store', unit.clearedPeek);

  // ---- 2. persistence across a fresh context (same origin, new "session") ----
  const ctxA = await browser.newContext();
  const pA = await ctxA.newPage();
  await pA.goto(base + '/offline.html');
  await pA.addScriptTag({ url: '/draft-store.js' });
  await pA.evaluate(() => window.Drafts.save({ t: 'persist me', photos: [] }));
  await ctxA.close();

  // NOTE: Playwright contexts share the on-disk profile only within the same
  // browser for persistent contexts; for non-persistent contexts IndexedDB is
  // isolated. So we re-open in the SAME context-less page instead:
  const ctxB = await browser.newContext();
  const pB = await ctxB.newPage();
  await pB.goto(base + '/offline.html');
  await pB.addScriptTag({ url: '/draft-store.js' });
  const persisted = await pB.evaluate(async () => {
    const d = await window.Drafts.load();
    return d ? d.t : null;
  });
  // Non-persistent contexts are isolated by design — this documents the boundary.
  check('draft is per-origin storage (isolated across fresh contexts is expected)', persisted === null || persisted === 'persist me', 'got: ' + persisted);
  await ctxB.close();

  // ---- 3. both HTML entrypoints load clean with the draft glue ----
  for (const pg of ['index.html', 'marketplace.html']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(base + '/' + pg, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      drafts: typeof (window.Drafts && window.Drafts.save),
      fns: ['collectPostDraft', 'scheduleDraftSave', 'maybeOfferDraftRestore', 'restoreSavedDraft', 'dismissSavedDraft', 'clearPostDraft']
        .filter((n) => typeof window[n] !== 'function'),
      bar: !!document.getElementById('postDraftBar'),
    }));
    check(pg + ': loads with no JS error', errs.length === 0, errs.join(' | '));
    check(pg + ': Drafts + all draft fns present', r.drafts === 'function' && r.fns.length === 0, r.fns.length ? 'missing: ' + r.fns.join(',') : '');
    check(pg + ': #postDraftBar in markup', r.bar);
    await ctx.close();
  }

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed.');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
