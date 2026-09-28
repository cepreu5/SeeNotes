// Language switch reloads at once; the profile write to Drive runs in the background after the start. Run from repo root:
//   node .bolter/check/lang-switch.mjs              (exit 1 on any failed assertion)
//   BASE=da9c5c6 node .bolter/check/lang-switch.mjs   serves uni/main.js from that commit (expected to fail (a) and (b) there)
// Real Chromium on uni/, Drive v3 stubbed: every settings request (AppSettings folder, settings.json lookup, read,
// PATCH upload) takes DRIVE_DELAY ms, so one saveSettingsToGDrive is ~2.6 s. The profile snapshot on "Drive" can be
// frozen at the OLD language (a stale snapshot), which is what brought the old language back on the next start.
// Static: neither language handler awaits saveSettingsToGDrive; node --check uni/main.js.
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const root = path.resolve('uni');
const BASE = process.env.BASE || '';
const PORT = 8773, ORIGIN = `http://localhost:${PORT}`;
const DRIVE_DELAY = 650;
const A = 'a.owner@example.com';
const mainSrc = BASE ? execFileSync('git', ['show', BASE + ':uni/main.js'], { maxBuffer: 64 << 20 }).toString() : await readFile(path.join(root, 'main.js'), 'utf8');
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const b = BASE && p === '/main.js' ? Buffer.from(mainSrc) : await readFile(path.join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store'}); res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT);
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };

// --- static ---
{
  const sw = mainSrc.match(/const switchLanguage = async \(lang\) => \{[\s\S]*?\n    \};/);
  const sel = mainSrc.match(/settingsLangSelect\.addEventListener\('change', async \(\) => \{[\s\S]*?\n            \}\);/);
  ok(!!sw && !!sel, 'static: both language handlers found (start screen switchLanguage, #settings-lang-select change)');
  for (const [name, m] of [['switchLanguage', sw], ['settings-lang-select', sel]]) {
    const body = m ? m[0] : '';
    ok(!!m && !/await\s+saveSettingsToGDrive/.test(body) && !/saveSettingsToGDrive\s*\(/.test(body.split(/location\.reload\(\)/)[0]),
      `static: ${name} does not await (or start) saveSettingsToGDrive before the reload`, body.slice(0, 400));
  }
  let checked = true;
  try { execFileSync(process.execPath, ['--check', '-'], { input: mainSrc, stdio: ['pipe', 'ignore', 'pipe'] }); } catch { checked = false; }
  ok(checked, 'static: node --check uni/main.js');
}

// --- live ---
const GIS = `window.google = { accounts: { oauth2: { initTokenClient(cfg) { return { requestAccessToken() {
  setTimeout(() => cfg.callback({ error: 'interaction_required' }), 50); } }; } }, id: { initialize() {}, renderButton() {}, prompt() {} } } };`;
const GAPI = `window.gapi = { load(n, cb) { cb(); }, client: { load: async () => {}, setToken() {}, getToken() { return null; } } };`;
const I18N = { bg: JSON.parse(await readFile(path.join(root, 'lang/i18n-bg.json'), 'utf8')), en: JSON.parse(await readFile(path.join(root, 'lang/i18n-en.json'), 'utf8')) };

const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block', locale: 'bg-BG' });
// Drive state: the settings.json content, whether uploads may change it, what the upload answers.
const drive = { profile: null, freeze: false, patchStatus: 200, uploads: [], reads: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const req = route.request(), u = req.url(), m = req.method();
  const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) }).catch(() => {});
  if (u.startsWith('https://accounts.google.com/gsi/client')) return route.fulfill({ contentType: 'text/javascript', body: GIS });
  if (u.startsWith('https://apis.google.com/js/api.js')) return route.fulfill({ contentType: 'text/javascript', body: GAPI });
  if (u.includes('generate_204')) return route.fulfill({ status: 204, body: '' });
  if (u.startsWith('https://script.google.com/')) return json({ success: true, term: 365, daysPassed: 1, email: A });
  if (u.includes('/oauth2/v3/userinfo')) return json({ email: A });
  if (u.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
    const rec = { at: Date.now(), method: m, url: u, body: req.postData() || '', status: drive.patchStatus, done: 0 };
    drive.uploads.push(rec);
    await sleep(DRIVE_DELAY);
    if (drive.patchStatus === 200 && !drive.freeze && m === 'PATCH') { try { drive.profile = JSON.parse(rec.body); } catch {} }
    rec.done = Date.now();
    return drive.patchStatus === 200 ? json({ id: 'set-1' }) : json({ error: { code: drive.patchStatus } }, drive.patchStatus);
  }
  if (u.startsWith('https://www.googleapis.com/drive/v3/files')) {
    await sleep(DRIVE_DELAY);
    const q = decodeURIComponent(new URL(u).searchParams.get('q') || '');
    if (/name='AppSettings'/.test(q)) return json({ files: [{ id: 'fold-1', name: 'AppSettings', modifiedTime: new Date().toISOString() }] });
    if (/name = 'settings\.json'/.test(q) && /'fold-1' in parents/.test(q)) return json({ files: [{ id: 'set-1', name: 'settings.json', modifiedTime: new Date().toISOString() }] });
    if (/\/files\/set-1\?alt=media/.test(u)) { drive.reads++; return route.fulfill({ contentType: 'text/plain', body: JSON.stringify(drive.profile) }).catch(() => {}); }
    return json({ files: [] });
  }
  return json({}, 404);
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// Navigations of the main frame (document requests), node clock like the upload records
const navs = [];
page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navs.push(Date.now()); });

// Profile snapshot for device 'Default'; `mark` is a harmless appSettingsKey used to see that the apply loop ran.
const snapshot = (lang, mark) => ({ Default: { language: lang, maxSavedSearches: String(mark), useGoogleDb: 'true' } });

async function seed() {
  await page.goto(ORIGIN + '/index.html');
  await page.evaluate(() => new Promise(r => { localStorage.clear(); sessionStorage.clear(); const q = indexedDB.deleteDatabase('NotesDB'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto(ORIGIN + '/index.html');
  await page.waitForFunction(() => typeof createDatabaseFromMemory === 'function' && typeof startApp === 'function');
  await page.evaluate(async (A) => {
    localStorage.setItem('useGoogleDb', 'true'); localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('initial_setup_complete', 'true'); localStorage.setItem('folderSetupDone', 'true');
    localStorage.setItem('active_folder_name', 'CX-Notes');
    sessionStorage.setItem('google_auth_email_hint', A);
    activeFolderName = 'CX-Notes';
    boardsData = [{ id: 1, gdid: 'b-1', title: 'Работа', color: 0, status: 0 }];
    const now = Date.now() - 60000;
    allNotesData = [{ id: 11, gdid: 'n-11', notetxt: 'Записки от срещата\nСрок: петък', boardid: 1, datemod: now, datecre: now, color: 0, version: 1, text_span: '', title_span: '' }];
    mediaData = [];
    await createDatabaseFromMemory({ suppressEmptyDataToast: true });
    await saveConfig('lastGDTimestamp', Date.now() - 30000);
  }, A);
}
// Device state before a start: valid 1 h token, given language, local profile cache = same snapshot as Drive.
const prime = (lang, localSnap, marker) => page.evaluate(([A, lang, localSnap, marker]) => {
  sessionStorage.clear();
  localStorage.setItem('language', lang);
  localStorage.removeItem('maxSavedSearches');
  if (marker) localStorage.setItem('pending_language_sync', marker); else localStorage.removeItem('pending_language_sync');
  localStorage.setItem('initial_setup_complete', 'true'); localStorage.setItem('folderSetupDone', 'true');
  localStorage.setItem('active_folder_name', 'CX-Notes'); localStorage.setItem('useIndexedDb', 'true');
  localStorage.setItem('google_login_hint', A);
  localStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'fresh', expires_in: 3599, issued_at: Date.now() }));
  localStorage.setItem('settings_multinotes_data', JSON.stringify(localSnap));
}, [A, lang, localSnap, marker]);
// App is up and the start-up loadSettingsFromGDrive(true) has applied the snapshot carrying `mark`
const waitApplied = (mark, timeout = 20000) => page.waitForFunction(m => localStorage.getItem('maxSavedSearches') === String(m)
  && typeof currentLang === 'string' && document.getElementById('settings-lang-select')?.dataset.hasChangeListener === 'true', mark, { timeout }).then(() => true, () => false);
const state = () => page.evaluate(() => ({ ls: localStorage.getItem('language'), cur: currentLang, marker: localStorage.getItem('pending_language_sync'),
  t: typeof _ === 'function' ? _('settingsSavedSuccess') : null, sel: document.getElementById('settings-lang-select')?.value }));
// Change the settings language select like a user would; returns node time of the change.
async function pickLanguage(lang) {
  const t0 = Date.now();
  await page.evaluate(l => setTimeout(() => { const s = document.getElementById('settings-lang-select'); s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); }, 0), lang).catch(() => {});
  return t0;
}

// ===== (a)+(b)+(c): stale profile says bg, device picks en =====
await seed();
drive.profile = snapshot('bg', 1); drive.freeze = true; drive.patchStatus = 200;
await prime('bg', snapshot('bg', 1), null);
await page.reload();
ok(await waitApplied(1), 'setup: app started in bg and applied the Drive profile snapshot');
let s = await state();
ok(s.ls === 'bg' && s.cur === 'bg' && s.t === I18N.bg.settingsSavedSuccess, 'setup: UI in Bulgarian before the switch', s);
await sleep(DRIVE_DELAY * 2); // let any start-up write settle so it is not counted below
drive.uploads.length = 0; navs.length = 0;
drive.profile = snapshot('bg', 2); // the snapshot Drive will hand back on the next start: still the OLD language
const t0 = await pickLanguage('en');
const navved = await page.waitForEvent('framenavigated', { timeout: 8000 }).then(() => true, () => false);
const navAt = navs[0] || 0;
const early = drive.uploads.filter(r => r.at < (navAt || Infinity));
ok(navved && navAt && navAt - t0 < 1000, `(a) instant: navigation ${navAt ? navAt - t0 : '-'} ms after the change (limit 1000)`, { navAt, t0 });
ok(!early.length, '(a) no settings upload (POST/PATCH) issued before the navigation', early.map(r => ({ m: r.method, dt: r.at - t0 })));
if (!BASE) console.log('     t(change->navigation) =', navAt - t0, 'ms');

const applied2 = await waitApplied(2);
s = await state();
ok(applied2 && s.ls === 'en', "(b) no revert: after the start applied the stale bg snapshot, localStorage 'language' is still en", s);
ok(s.cur === 'en' && s.t === I18N.en.settingsSavedSuccess && s.sel === 'en', '(b) the running UI is English (currentLang, translated string, settings select)', s);

const bg = await page.waitForFunction(() => !localStorage.getItem('pending_language_sync'), null, { timeout: 15000 }).then(() => true, () => false);
const bgUp = drive.uploads.filter(r => r.at >= (navAt || 0) && r.method === 'PATCH');
let body = null; try { body = JSON.parse(bgUp[bgUp.length - 1].body); } catch {}
ok(bgUp.length >= 1 && body?.Default?.language === 'en', '(c) background write after the reload carries language en', { uploads: bgUp.length, lang: body?.Default?.language });
ok(bg, '(c) pending_language_sync is gone once the write went through', await state());
// Next start once Drive holds what was written: still en, no marker, no further forced write
drive.freeze = false; if (body) drive.profile = { ...body, Default: { ...body.Default, maxSavedSearches: '3' } };
drive.uploads.length = 0;
await page.reload();
const applied3 = await waitApplied(3);
s = await state();
ok(applied3 && s.ls === 'en' && s.cur === 'en' && !s.marker, '(c) next start with the updated profile: en, no marker', s);

// ===== (d1): write fails with 500 -> marker survives, language stays =====
drive.profile = snapshot('bg', 4); drive.freeze = true;
await prime('bg', snapshot('bg', 4), null);
await page.reload();
ok(await waitApplied(4), 'setup (d): back in bg');
await sleep(DRIVE_DELAY * 2);
drive.profile = snapshot('bg', 5); drive.patchStatus = 500; drive.uploads.length = 0; navs.length = 0;
await pickLanguage('en');
await page.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => {});
const applied5 = await waitApplied(5);
// wait until the failed upload has been answered, then give the rejection a moment to reach the catch
const failed = await (async () => { for (let i = 0; i < 60; i++) { if (drive.uploads.some(r => r.done && r.status === 500)) return true; await sleep(100); } return false; })();
await page.waitForFunction(() => new Promise(r => setTimeout(() => r(true), 200)));
s = await state();
ok(applied5 && failed, '(d) failing profile write (500) was attempted after the reload', { applied5, uploads: drive.uploads.map(r => r.status) });
ok(s.marker === 'en' && s.ls === 'en' && s.cur === 'en', '(d) after the failed write the marker is kept and the language is still en', s);

// ===== (d2): offline start with the marker present -> marker kept, language kept, no upload =====
drive.patchStatus = 200; drive.uploads.length = 0;
await page.evaluate(() => localStorage.setItem('maxSavedSearches', 'x'));
await page.goto(ORIGIN + '/index.html?offline');
await page.waitForFunction(() => typeof isOffline !== 'undefined' && isOffline === true && document.getElementById('settings-lang-select')?.dataset.hasChangeListener === 'true', null, { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => new Promise(r => setTimeout(() => r(true), 1500)));
s = await state();
ok(s.marker === 'en' && s.ls === 'en' && s.cur === 'en' && !drive.uploads.length, '(d) offline start: marker survives, language en, nothing uploaded', { ...s, uploads: drive.uploads.length });

const ours = errors.filter(e => !/kofiWidgetOverlay/.test(e));
ok(!ours.length, 'no uncaught page errors (besides the stubbed-out Ko-fi widget)', ours);
console.log(`${n - fails}/${n} passed`);
await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
