// Start with local data + expired token (b1.78), real browser on uni/. Run from repo root:
//   node .bolter/check/startup-local.mjs            (exit 1 on any failed assertion)
//   BASE=6924d7d node .bolter/check/startup-local.mjs   serves uni/main.js from that commit (expected to fail there)
// IndexedDB is seeded with 3 notes, the stored token is 2h old. Google Identity Services is a stub whose
// silent token request answers only after GIS_DELAY ms (ok or fail), so "the notes did not wait" is observable.
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const root = path.resolve('uni');
const BASE = process.env.BASE || '';
const TAG = BASE ? 'before' : 'after';
const GIS_DELAY = 6000;
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const b = BASE && p === '/main.js' ? execFileSync('git', ['show', BASE + ':uni/main.js'], { maxBuffer: 64 << 20 }) : await readFile(path.join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store'}); res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(8769);
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };

// GIS stub: every silent token request is counted; the answer comes after the delay, mode from localStorage.
const GIS = `window.google = { accounts: { oauth2: { initTokenClient(cfg) { return { requestAccessToken() {
  window.__gisRequests = (window.__gisRequests || 0) + 1;
  setTimeout(() => { window.__gisAnsweredAt = performance.now();
    cfg.callback(localStorage.getItem('__gisMode') === 'ok' ? { access_token: 'fresh', expires_in: 3599 } : { error: 'interaction_required' }); },
    +localStorage.getItem('__gisDelay'));
} }; } }, id: { initialize() {}, renderButton() {}, prompt() {} } } };`;
const GAPI = `window.gapi = { load(n, cb) { cb(); }, client: { load: async () => {}, setToken() {}, getToken() { return null; } } };`;

const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const u = route.request().url();
  if (u.startsWith('https://accounts.google.com/gsi/client')) return route.fulfill({ contentType: 'text/javascript', body: GIS });
  if (u.startsWith('https://apis.google.com/js/api.js')) return route.fulfill({ contentType: 'text/javascript', body: GAPI });
  if (u.includes('generate_204')) return route.fulfill({ status: 204, body: '' });
  if (u.includes('/oauth2/v3/userinfo')) return route.fulfill({ contentType: 'application/json', body: '{"email":"test@example.com"}' });
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
});
await ctx.addInitScript(() => {
  window.__toasts = [];
  document.addEventListener('DOMContentLoaded', () => {
    const t = document.getElementById('toastNotification');
    if (t) new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true });
  });
});
const page = await ctx.newPage();
const errors = [], log = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => log.push({ t: m.text(), at: Date.now() }));

// Seed: login page (no token), then write boards + notes through the app's own createDatabaseFromMemory.
await page.goto('http://localhost:8769/index.html');
await page.waitForFunction(() => typeof createDatabaseFromMemory === 'function' && typeof startApp === 'function');
await page.evaluate(async () => {
  localStorage.setItem('useGoogleDb', 'true'); localStorage.setItem('useIndexedDb', 'true');
  localStorage.setItem('initial_setup_complete', 'true'); localStorage.setItem('folderSetupDone', 'true');
  localStorage.setItem('active_folder_name', 'CX-Notes'); localStorage.setItem('google_login_hint', 'test@example.com');
  activeFolderName = 'CX-Notes';
  boardsData = [{ id: 1, gdid: 'b-1', title: 'Работа', color: 0, status: 0 }, { id: 2, gdid: 'b-2', title: 'Лични', color: 0, status: 0 }];
  const now = Date.now();
  allNotesData = [
    { id: 11, gdid: 'n-11', notetxt: 'Записки от срещата\nСрок: петък', boardid: 1, datemod: now, datecre: now, color: 0, version: 1, text_span: '', title_span: '' },
    { id: 12, gdid: 'n-12', notetxt: 'Идеи за CX Notes\nЛокален старт', boardid: 2, datemod: now - 1000, datecre: now, color: 0, version: 1, text_span: '', title_span: '' },
    { id: 13, gdid: 'n-13', notetxt: 'Списък за покупки\nмляко, хляб', boardid: 0, datemod: now - 2000, datecre: now, color: 0, version: 1, text_span: '', title_span: '' },
  ];
  mediaData = [];
  await createDatabaseFromMemory({ suppressEmptyDataToast: true });
});
// Before every start: the stored token is 2h old; folder settings restored (the 404 Drive stub makes the
// sync give up on the folder and clear them).
const expired = mode => page.evaluate(([mode, delay]) => {
  sessionStorage.clear();
  localStorage.setItem('initial_setup_complete', 'true'); localStorage.setItem('folderSetupDone', 'true');
  localStorage.setItem('active_folder_name', 'CX-Notes'); localStorage.setItem('useIndexedDb', 'true');
  localStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'old', expires_in: 3599, issued_at: Date.now() - 7200e3 }));
  localStorage.setItem('__gisMode', mode); localStorage.setItem('__gisDelay', String(delay));
}, [mode, GIS_DELAY]);
// All three seeded notes rendered as cards, at least one visible on the start board, loader gone.
const notesShown = () => ['n-11', 'n-12', 'n-13'].every(g => document.querySelector(`.note[data-g="${g}"]`))
  && [...document.querySelectorAll('.note-item')].some(e => e.offsetParent)
  && getComputedStyle(document.getElementById('loader-container')).display === 'none';
const st = () => page.evaluate(() => ({ suspended: isSyncSuspended, gis: window.__gisRequests || 0, answered: window.__gisAnsweredAt || 0,
  now: performance.now(), toasts: window.__toasts, modeWarn: (document.getElementById('mode_button')?.textContent || '').includes('⚠'),
  login: getComputedStyle(document.getElementById('login-page')).display !== 'none' && !document.getElementById('login-page').hidden }));

// (a) expired token + local data, refresh succeeds after GIS_DELAY
await expired('ok');
log.length = 0; errors.length = 0;
let t0 = Date.now();
await page.reload();
// Same moment in both builds: 1.5 s after the reload (base: still on the loader, waiting for the token).
await page.waitForFunction(() => false, null, { timeout: 1500 }).catch(() => {});
await page.screenshot({ path: `.bolter/check/startup-local-390-${TAG}-1500ms.png` });
const shown = await page.waitForFunction(notesShown, null, { timeout: GIS_DELAY + 15000 }).then(() => true, () => false);
let s = await st(); const tShown = Date.now() - t0;
await page.screenshot({ path: `.bolter/check/startup-local-390-${TAG}.png` });
ok(shown && s.answered === 0, `(a) notes from the local DB on screen before the token refresh answered (${tShown} ms, refresh answers after ${GIS_DELAY} ms)`, { shown, ...s });
ok(tShown < GIS_DELAY, `(a) notes shown in under ${GIS_DELAY} ms`, tShown);
ok(s.gis === 1, '(a) exactly one silent token request, running in the background', s.gis);
ok(!s.toasts.some(x => /suspend|спрян/i.test(x)), '(a) no "Sync suspended" bubble at start', s.toasts);
await page.waitForFunction(() => window.__gisAnsweredAt && !isSyncSuspended, null, { timeout: GIS_DELAY + 5000 }).catch(() => {});
await page.waitForFunction(() => false, null, { timeout: 1500 }).catch(() => {}); // give the sync block its turn (it logs, then fails on the 404 Drive stub)
s = await st();
const iRefresh = log.findIndex(l => /Background token refresh succeeded|Token refreshed successfully/.test(l.t));
const iSync = log.findIndex(l => /Starting background sync task/.test(l.t));
ok(!s.suspended && !s.modeWarn, '(a) after the refresh: sync no longer suspended, mode icon without ⚠', s);
ok(iRefresh >= 0 && iSync > iRefresh, '(a) background sync started right after the refresh, without reopening the app', { iRefresh, iSync });
ok(!s.login, '(a) no login page', s);

// (b) expired token + local data, silent refresh fails: stays local, silent, retries when the network returns
await expired('fail');
log.length = 0;
t0 = Date.now();
await page.reload();
const shownB = await page.waitForFunction(notesShown, null, { timeout: GIS_DELAY + 15000 }).then(() => true, () => false);
s = await st();
ok(shownB && s.answered === 0 && Date.now() - t0 < GIS_DELAY, `(b) notes on screen before the (failing) refresh answered (${Date.now() - t0} ms)`, { shownB, ...s });
await page.waitForFunction(() => window.__gisAnsweredAt, null, { timeout: GIS_DELAY + 5000 }).catch(() => {});
await page.waitForFunction(() => false, null, { timeout: 800 }).catch(() => {});
s = await st();
ok(s.answered > 0 && s.suspended && s.modeWarn, '(b) refresh failed: local mode kept, mode icon shows it', s);
ok(!s.toasts.length, '(b) no bubble at all', s.toasts);
ok(!s.login && await page.evaluate(notesShown), '(b) notes still on screen, no login page', s);
ok(!log.some(l => /Starting background sync task/.test(l.t)), '(b) no sync attempted without a token');
await page.screenshot({ path: `.bolter/check/startup-local-390-${TAG}-failed.png` });
await page.evaluate(() => { localStorage.setItem('__gisDelay', '10'); localStorage.setItem('__gisMode', 'ok'); window.dispatchEvent(new Event('online')); });
await page.waitForFunction(() => window.__gisRequests >= 2 && !isSyncSuspended, null, { timeout: 3000 }).catch(() => {});
await page.waitForFunction(() => false, null, { timeout: 800 }).catch(() => {});
s = await st();
ok(s.gis === 2 && !s.suspended && !s.modeWarn, '(b) network back ("online") -> one more silent refresh, it succeeds, local mode ends', s);
ok(log.some(l => /Starting background sync task/.test(l.t)), '(b) ... and the sync starts right away');

// (c) 1280 wide, refresh succeeds - screenshot
await page.setViewportSize({ width: 1280, height: 800 });
await expired('ok');
t0 = Date.now();
await page.reload();
const shownC = await page.waitForFunction(notesShown, null, { timeout: GIS_DELAY + 15000 }).then(() => true, () => false);
s = await st();
ok(shownC && s.answered === 0, `(c) 1280: notes before the refresh answered (${Date.now() - t0} ms)`, s);
await page.screenshot({ path: `.bolter/check/startup-local-1280-${TAG}.png` });

// (d) no local data: order unchanged, the refresh is awaited and a failure ends on the login page
await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('NotesDB'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
await page.setViewportSize({ width: 390, height: 800 });
await expired('fail');
await page.evaluate(() => localStorage.setItem('__gisDelay', '1500'));
await page.reload();
await page.waitForFunction(() => window.__gisAnsweredAt, null, { timeout: 15000 }).catch(() => {});
await page.waitForFunction(() => { const l = document.getElementById('login-page'); return l && !l.hidden && getComputedStyle(l).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
s = await st();
ok(s.gis === 1 && s.answered > 0 && s.login && !s.suspended, '(d) no local data: refresh awaited, failure -> login page', s);

const ours = errors.filter(e => !/kofiWidgetOverlay/.test(e)); // the Ko-fi widget script is external, stubbed to 404 here
ok(!ours.length, 'no uncaught page errors (besides the stubbed-out Ko-fi widget)', ours);
console.log(`${n - fails}/${n} passed`);
await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
