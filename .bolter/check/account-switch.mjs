// Account switch (plan 14), real browser on uni/. Run from repo root:
//   node .bolter/check/account-switch.mjs            (exit 1 on any failed assertion)
//   BASE=0b0e779 node .bolter/check/account-switch.mjs   serves uni/main.js from that commit (expected to fail there)
// NotesDB is seeded by account A through the app's own createDatabaseFromMemory. The device then starts
// with a valid token of account B; the userinfo stub answers B only after USERINFO_DELAY ms, so
// "the notes of the local DB were drawn before the account check answered" is observable.
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const root = path.resolve('uni');
const BASE = process.env.BASE || '';
const USERINFO_DELAY = 2500;
const A = 'a.owner@example.com', B = 'b.new@example.com';
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const b = BASE && p === '/main.js' ? execFileSync('git', ['show', BASE + ':uni/main.js'], { maxBuffer: 64 << 20 }) : await readFile(path.join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store'}); res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(8771);
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };

const GIS = `window.google = { accounts: { oauth2: { initTokenClient(cfg) { return { requestAccessToken() {
  setTimeout(() => cfg.callback({ error: 'interaction_required' }), 50); } }; } }, id: { initialize() {}, renderButton() {}, prompt() {} } } };`;
const GAPI = `window.gapi = { load(n, cb) { cb(); }, client: { load: async () => {}, setToken() {}, getToken() { return null; } } };`;

const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block', acceptDownloads: true, locale: 'bg-BG' });
let userinfoEmail = B, userinfoCalls = 0, userinfoAnsweredAt = 0;
await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const u = route.request().url();
  if (u.startsWith('https://accounts.google.com/gsi/client')) return route.fulfill({ contentType: 'text/javascript', body: GIS });
  if (u.startsWith('https://apis.google.com/js/api.js')) return route.fulfill({ contentType: 'text/javascript', body: GAPI });
  if (u.includes('generate_204')) return route.fulfill({ status: 204, body: '' });
  // License whitelist (Apps Script): a valid licence for whichever email asks
  if (u.startsWith('https://script.google.com/')) {
    let email = ''; try { email = JSON.parse(route.request().postData() || '{}').email || ''; } catch {}
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, term: 365, daysPassed: 1, email }) });
  }
  if (u.includes('/oauth2/v3/userinfo')) {
    userinfoCalls++;
    await new Promise(r => setTimeout(r, USERINFO_DELAY));
    userinfoAnsweredAt = Date.now();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ email: userinfoEmail }) }).catch(() => {});
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
});
// First moment any note card of the seeded DB is in the DOM (page clock = Date.now, same machine as the route).
await ctx.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => { if (!window.__notesAt && document.querySelector('.note[data-g^="n-"]')) window.__notesAt = Date.now(); })
      .observe(document.body, { childList: true, subtree: true });
  });
});
// (6) "translations not loaded": lang/i18n-*.json blocked and window.initialTranslationsPromise removed
let blockLang = false;
await ctx.route(/\/lang\/i18n-[a-z]+\.json/, route => blockLang ? route.abort() : route.continue());
await ctx.addInitScript(() => {
  if (localStorage.getItem('__testNoInitTr') !== '1') return;
  Object.defineProperty(window, 'initialTranslationsPromise', { configurable: true, get() { return undefined; }, set() { } });
});
const I18N = { bg: JSON.parse(await readFile(path.join(root, 'lang/i18n-bg.json'), 'utf8')), en: JSON.parse(await readFile(path.join(root, 'lang/i18n-en.json'), 'utf8')) };
const fillT = (t, dbE, newE, count) => t.replace(/\{new\}/g, newE).replace(/\{old\}/g, dbE).replace(/\{count\}/g, count);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
const log = [];
page.on('console', m => log.push(m.text().slice(0, 200)));

const NOTE_TEXT = ['Записки от срещата', 'Идеи за CX Notes', 'Списък за покупки'];
const dbInfo = () => page.evaluate(async () => {
  const has = (await indexedDB.databases()).some(d => d.name === 'NotesDB');
  if (!has) return { exists: false };
  const db = await new Promise((r, j) => { const q = indexedDB.open('NotesDB'); q.onsuccess = () => r(q.result); q.onerror = j; });
  const get = (store, key) => new Promise(r => { const q = db.transaction(store).objectStore(store)[key === undefined ? 'getAll' : 'get'](key); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
  const names = [...db.objectStoreNames];
  const out = { exists: true, userEmail: names.includes('config') ? await get('config', 'userEmail') : null, notes: names.includes('notes') ? (await get('notes')).length : 0 };
  db.close(); return out;
});
// Fresh DB of account A (3 notes; with dirty=true one more note newer than the last sync).
async function seedA(dirty) {
  if (!page.url().startsWith('http://localhost:8771')) await page.goto('http://localhost:8771/index.html');
  await page.evaluate(() => new Promise(r => { localStorage.clear(); sessionStorage.clear(); const q = indexedDB.deleteDatabase('NotesDB'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto('http://localhost:8771/index.html');
  await page.waitForFunction(() => typeof createDatabaseFromMemory === 'function' && typeof startApp === 'function');
  await page.evaluate(async ([A, dirty]) => {
    localStorage.setItem('useGoogleDb', 'true'); localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('initial_setup_complete', 'true'); localStorage.setItem('folderSetupDone', 'true');
    localStorage.setItem('active_folder_name', 'CX-Notes');
    sessionStorage.setItem('google_auth_email_hint', A);
    activeFolderName = 'CX-Notes';
    boardsData = [{ id: 1, gdid: 'b-1', title: 'Работа', color: 0, status: 0 }, { id: 2, gdid: 'b-2', title: 'Лични', color: 0, status: 0 }];
    const now = Date.now() - 60000;
    allNotesData = [
      { id: 11, gdid: 'n-11', notetxt: 'Записки от срещата\nСрок: петък', boardid: 1, datemod: now, datecre: now, color: 0, version: 1, text_span: '', title_span: '' },
      { id: 12, gdid: 'n-12', notetxt: 'Идеи за CX Notes\nЛокален старт', boardid: 2, datemod: now - 1000, datecre: now, color: 0, version: 1, text_span: '', title_span: '' },
      { id: 13, gdid: 'n-13', notetxt: 'Списък за покупки\nмляко, хляб', boardid: 0, datemod: now - 2000, datecre: now, color: 0, version: 1, text_span: '', title_span: '' },
    ];
    mediaData = [];
    await createDatabaseFromMemory({ suppressEmptyDataToast: true });
    await saveConfig('lastGDTimestamp', Date.now() - 30000);
    if (dirty) await bulkPutDB(NOTE_STORE_NAME, [{ id: 14, gdid: 'n-14', notetxt: 'Офлайн редакция\nне е качена', boardid: 1, datemod: Date.now(), datecre: now, color: 0, version: 1, text_span: '', title_span: '' }], true);
  }, [A, dirty]);
}
// Start as a device that already has a valid (1 h) token; hint = what localStorage says about the account.
const startWith = (hint, lang = 'bg') => page.evaluate(([hint, lang]) => {
  sessionStorage.clear();
  localStorage.setItem('language', lang);
  localStorage.setItem('initial_setup_complete', 'true'); localStorage.setItem('folderSetupDone', 'true');
  localStorage.setItem('active_folder_name', 'CX-Notes'); localStorage.setItem('useIndexedDb', 'true');
  localStorage.setItem('google_login_hint', hint);
  localStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'fresh', expires_in: 3599, issued_at: Date.now() }));
}, [hint, lang]);
const notice = () => page.evaluate((NOTE_TEXT) => {
  const o = document.getElementById('account-switch-notice');
  const visible = !!o && o.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && o.getBoundingClientRect().width > 0;
  const bodyText = document.body.innerText;
  const r = o && o.querySelector('.popup-content').getBoundingClientRect();
  const top = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  return { onTop: !!(top && o.contains(top)), visible, buttons: o ? o.querySelectorAll('button').length : 0, text: o ? o.innerText : '',
    noteEls: document.querySelectorAll('.note, .note-item').length, noteTextInDom: NOTE_TEXT.filter(t => document.body.innerHTML.includes(t)),
    noteTextVisible: NOTE_TEXT.filter(t => bodyText.includes(t)), notesAt: window.__notesAt || 0,
    pending: localStorage.getItem('pendingAccountReset') };
}, NOTE_TEXT);
// Each piece of the notice separately: title, main paragraph, hidden-notes line, unsynced line, button label
const parts = () => page.evaluate(() => {
  const o = document.getElementById('account-switch-notice');
  if (!o) return null;
  const p = o.querySelectorAll('p');
  const t = el => el ? el.innerText : null;
  return { title: t(o.querySelector('h3')), text: t(p[0]), hidden: t(p[1]), unsynced: p[2] && p[2].style.display !== 'none' ? t(p[2]) : '', button: t(o.querySelector('button')),
    rawText: p[0] ? p[0].textContent : null };
});
const waitNotice = () => page.waitForFunction(() => { const o = document.getElementById('account-switch-notice'); return o && o.checkVisibility({ visibilityProperty: true, opacityProperty: true }); }, null, { timeout: USERINFO_DELAY + 15000 }).then(() => true, () => false);

// (1) The reported bug: DB of A, stale hint still says A, the real account (userinfo) is B.
await seedA(true);
await startWith(A);
userinfoCalls = 0; userinfoAnsweredAt = 0;
await page.reload();
const drew = await page.waitForFunction(() => window.__notesAt, null, { timeout: USERINFO_DELAY + 10000 }).then(() => true, () => false);
let shown = await waitNotice();
let s = await notice();
ok(drew && userinfoAnsweredAt > 0 && s.notesAt < userinfoAnsweredAt, `(1) fast path: local notes drawn ${userinfoAnsweredAt - s.notesAt} ms before the userinfo answer (the check did not gate the first draw)`, { drew, notesAt: s.notesAt, userinfoAnsweredAt });
ok(shown && s.visible && s.onTop, '(1) stale hint A + userinfo B -> account-switch notice on screen, on top of everything', s);
ok(s.buttons === 1, '(1) the notice has exactly one button', s.buttons);
ok(s.text.includes(A) && s.text.includes(B) && /Открит е друг акаунт/.test(s.text), '(1) the notice names both accounts, in Bulgarian', s.text);
ok(/несинхронизирани/.test(s.text), '(1) the notice says unsynced notes will be downloaded first', s.text);
ok(s.noteEls === 0 && !s.noteTextInDom.length, '(1) no note of A left in the DOM', s);
let db = await dbInfo();
ok(db.exists && db.userEmail === A && db.notes === 4, '(1) NotesDB of A still present before OK', db);
ok(JSON.parse(s.pending || '{}').confirmed === true, '(1) confirmed intent persisted (pendingAccountReset)', s.pending);
if (!BASE) await page.screenshot({ path: '.bolter/check/account-switch-390.png' });
await page.waitForFunction(() => { const p = document.querySelectorAll('#account-switch-notice p')[2]; return p && p.style.display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
let pt = await parts();
ok(pt && pt.title === I18N.bg.accountSwitchTitle && pt.text === fillT(I18N.bg.accountSwitchText, A, B, 1) && pt.hidden === I18N.bg.accountSwitchNotesHidden
  && pt.unsynced === fillT(I18N.bg.accountSwitchUnsynced, A, B, 1) && pt.button === I18N.bg.okButton,
  '(a) translations loaded, BG UI: title, text, hidden line, unsynced line and button are exactly the strings of i18n-bg.json', pt);

// (2) Closed without pressing OK: nothing deleted, the notice comes back, this time before any network answer.
await startWith(A);
userinfoAnsweredAt = 0;
await page.reload();
shown = await waitNotice();
s = await notice();
ok(shown && s.onTop && s.buttons === 1 && userinfoAnsweredAt === 0, '(2) reopened without OK: notice back at once from the persisted intent', { shown, userinfoAnsweredAt });
ok(!s.notesAt && s.noteEls === 0, '(2) notes of A never drawn on the second start', s);
db = await dbInfo();
ok(db.exists && db.userEmail === A, '(2) DB of A still present (nothing deleted without OK)', db);
await page.setViewportSize({ width: 1280, height: 800 });
if (!BASE) await page.screenshot({ path: '.bolter/check/account-switch-1280.png' });
await page.setViewportSize({ width: 390, height: 800 });

// (3) OK: unsynced note downloaded, DB deleted, then reload.
const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
const nav = page.waitForEvent('load', { timeout: 20000 }).then(() => true, () => false);
await page.click('#account-switch-ok');
const download = await dl;
let dlBody = null;
if (download) { try { dlBody = JSON.parse(await readFile(await download.path(), 'utf8')); } catch {} }
ok(download && /cx-notes-a\.owner@example\.com/.test(download.suggestedFilename()) && dlBody?.notes?.length === 1 && dlBody.notes[0].gdid === 'n-14',
  '(3) OK -> the one unsynced note is offered as a download before deletion', { name: download?.suggestedFilename(), notes: dlBody?.notes?.map(x => x.gdid) });
const reloaded = await nav;
db = await dbInfo();
ok(reloaded, '(3) the app reloaded after the deletion');
ok(!db.exists || (db.userEmail !== A && db.notes === 0), '(3) NotesDB of A gone after OK', db);
const after = await page.evaluate(() => ({ pending: localStorage.getItem('pendingAccountReset'), hint: localStorage.getItem('google_login_hint'), done: sessionStorage.getItem('accountSwitchDone') }));
ok(!after.pending && after.hint === 'b.new@example.com' && after.done === '1', '(3) intent cleared, hint now B, once-per-session flag set', after);

// (4) Hint already says B (login with B), DB of A: same notice, still one button, no notes.
await seedA(false);
await startWith(B, 'en');
await page.reload();
shown = await waitNotice();
s = await notice();
ok(shown && s.buttons === 1 && s.noteEls === 0 && !s.noteTextInDom.length, '(4) hint B + userinfo B, DB of A -> notice, one button, no notes of A', s);
ok(/A different account was detected/.test(s.text) && s.text.includes(A), '(4) English UI: the notice has the English text', s.text);
ok(!/unsynced/.test(s.text), '(4) no unsynced-notes line when nothing is newer than the last sync', s.text);
pt = await parts();
ok(pt && pt.title === I18N.en.accountSwitchTitle && pt.text === fillT(I18N.en.accountSwitchText, A, B, 0) && pt.hidden === I18N.en.accountSwitchNotesHidden
  && pt.button === I18N.en.okButton && !/[А-Яа-я]/.test(pt.title + pt.text + pt.hidden),
  '(a) translations loaded, EN UI: exactly the strings of i18n-en.json, no Bulgarian', pt);
db = await dbInfo();
ok(db.exists && db.userEmail === A, '(4) DB still present before OK', db);

// (5) Control: same account A -> no notice, notes stay, DB untouched.
await seedA(false);
await startWith(A);
userinfoEmail = A;
await page.reload();
await page.waitForFunction(() => window.__notesAt, null, { timeout: 10000 }).catch(() => {});
await page.waitForFunction(n => window.__uiDone || false, null, { timeout: USERINFO_DELAY + 1500 }).catch(() => {}); // let the account check answer
s = await notice();
db = await dbInfo();
ok(!s.visible && s.noteEls > 0 && !s.pending, '(5) same account: no notice, notes on screen, nothing pending', s);
ok(db.exists && db.userEmail === A && db.notes === 3, '(5) DB of A untouched', db);

// (6) Translations not loaded at the moment the notice is shown: bilingual, nothing empty, nothing deleted.
userinfoEmail = B;
await seedA(true);
await startWith(A, 'bg');
await page.evaluate(() => localStorage.setItem('__testNoInitTr', '1'));
blockLang = true;
await page.reload();
shown = await waitNotice();
await page.waitForFunction(() => { const p = document.querySelectorAll('#account-switch-notice p')[2]; return p && p.style.display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
pt = await parts();
const st6 = await page.evaluate(() => ({ promise: typeof window.initialTranslationsPromise, fallback: !!translationsFallback[currentLang], lang: currentLang }));
console.log('     bilingual notice as shown:', JSON.stringify(pt));
const both = (got, key, count = 1) => !!got && got.includes(fillT(I18N.bg[key], A, B, count)) && got.includes(fillT(I18N.en[key], A, B, count));
ok(shown && st6.promise === 'undefined' && st6.fallback, '(6) lang files blocked, initialTranslationsPromise gone -> the notice still comes up', { shown, st6 });
ok(pt && both(pt.title, 'accountSwitchTitle') && both(pt.text, 'accountSwitchText') && both(pt.hidden, 'accountSwitchNotesHidden') && both(pt.unsynced, 'accountSwitchUnsynced'),
  '(6) no translations: title, main text, hidden line and unsynced line carry both the Bulgarian and the English text', pt);
ok(pt && pt.button.trim() === 'ОК' && [pt.title, pt.text, pt.hidden, pt.unsynced, pt.button].every(x => x && x.trim()), '(6) nothing on the notice is empty, the button says ОК', pt);
ok(pt && pt.rawText.includes(fillT(I18N.bg.accountSwitchText, A, B, 1) + '\n\n' + fillT(I18N.en.accountSwitchText, A, B, 1)) && pt.text.split('\n').filter(Boolean).length === 2,
  '(6) the two languages are on separate lines, not one run-on line', pt.text);
if (!BASE) await page.screenshot({ path: '.bolter/check/account-switch-bilingual-390.png' });
db = await dbInfo();
ok(db.exists && db.userEmail === A && db.notes === 4, '(6) NotesDB of A untouched while the bilingual notice stands', db);
// OK while offline: the toast is bilingual too and still nothing is deleted
await page.evaluate(() => { isOffline = true; });
await page.click('#account-switch-ok');
const toast6 = await page.waitForFunction(() => { const t = document.getElementById('toastNotification'); return t && t.classList.contains('show') && t.innerText; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => '');
ok(toast6.includes(I18N.bg.accountSwitchNeedsOnline) && toast6.includes(I18N.en.accountSwitchNeedsOnline), '(6) offline OK -> bilingual "no internet" toast', toast6);
db = await dbInfo();
ok(db.exists && db.userEmail === A && db.notes === 4, '(6) offline OK deleted nothing', db);
// Translations arrive after the notice is up: the standing notice switches to the file text, no reload
blockLang = false;
await page.evaluate(async () => { isOffline = false; await setLanguage(currentLang); });
pt = await parts();
ok(pt && pt.title === I18N.bg.accountSwitchTitle && pt.text === fillT(I18N.bg.accountSwitchText, A, B, 1) && pt.unsynced === fillT(I18N.bg.accountSwitchUnsynced, A, B, 1) && pt.button === I18N.bg.okButton,
  '(6) translations arriving later refresh the standing notice to the i18n-bg.json text', pt);
await page.evaluate(() => localStorage.removeItem('__testNoInitTr'));

const ours = errors.filter(e => !/kofiWidgetOverlay/.test(e));
ok(!ours.length, 'no uncaught page errors (besides the stubbed-out Ko-fi widget)', ours);
console.log(`${n - fails}/${n} passed`);
await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
