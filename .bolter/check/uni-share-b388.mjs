// b3.88 (порт от nomn b5.41–b5.48): share target обработката в uni.
//
// Какво се проверява:
//   1) браузърът сервира uni/sw.js на тази глава;
//   2) всяко споделяне пази своето, по sid — старо чакащо не се трие от ново (POST през SW);
//   3) приложението слива всички чакащи споделяния в една бележка, по реда на пристигане;
//   4) търсеното по sid споделяне води, останалите не се губят;
//   5) restorePendingShare връща под ключа на самото споделяне;
//   6) споделен файл влиза в бележката веднага (attachFilesToModal), преди запис;
//   7) линк към снимка се показва като снимка, а служебното заглавие „Action“ се маха;
//   8) истинско заглавие при линк към снимка остава;
//   9) обикновен линк не става снимка;
//  10) празно споделяне казва какво да се направи;
//  11) картата на снимката е блок в ширината на бележката (CSS);
//  12) без грешки в конзолата.

import path from 'path';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let chromium;
for (const p of [
  'playwright',
  '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
  '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
  '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs',
]) {
  try { ({ chromium } = await import(p)); break; } catch (e) { /* следващият път */ }
}
if (!chromium) {
  try { ({ chromium } = await import(path.join(__dirname, 'node_modules', 'playwright', 'index.mjs'))); } catch (e) { }
}
if (!chromium) { console.error('playwright не се намира'); process.exit(2); }

const URL = process.env.PAGE || 'http://127.0.0.1:8110/uni/index.html';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  — ' + extra : ''}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
  const isScript = /\.js(\?|$)/.test(route.request().url());
  await route.fulfill({
    status: 200,
    contentType: isScript ? 'application/javascript' : 'image/gif',
    body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'),
  });
});

const page = await ctx.newPage();
const errors = [];
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error' && !/404|Failed to load resource|Refused to execute script/.test(t)) errors.push(t);
});
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.addInitScript(() => {
  const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
  window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
  window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
  window.kofiWidgetOverlay = { draw() { } };
  window.kofiwidget2 = { init() { }, draw() { } };
  localStorage.setItem('guide', 'false');
  localStorage.setItem('useIndexedDb', 'false');
  localStorage.setItem('language', 'bg');
  localStorage.setItem('singleNoteMode', 'false');
  localStorage.setItem('showAdvancedSettings', 'false');
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  try { startApp(); } catch (e) { window.__startAppError = String(e); }
  boardsData = [{ id: 1, gdid: 'b1', title: 'Main', numord: 1, status: 0, datemod: Date.now() }];
  allNotesData = [];
  mediaData = [];
  openNotesRestoreDone = true;
  window.__modals = [];
  window.__toasts = [];
  window.__attached = [];
  window.showModal = (o) => { window.__modals.push(o); };
  window.showToast = (t) => { window.__toasts.push(String(t)); };
  window.attachFilesToModal = (files) => {
    window.__attached.push((files || []).map(f => ({ name: f.name, type: f.type, size: f.size })));
  };
});

// 1) Главата
const swText = await readFile(path.join(__dirname, '..', '..', 'uni', 'sw.js'), 'utf8');
const wantCache = (swText.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1] || '';
const swVersion = await page.evaluate(async () => {
  try {
    const txt = await (await fetch('sw.js', { cache: 'no-store' })).text();
    const m = txt.match(/CACHE_NAME\s*=\s*'([^']+)'/);
    return m ? m[1] : '';
  } catch (e) { return ''; }
});
check('sw.js в браузъра е този от uni/sw.js', !!wantCache && swVersion === wantCache, swVersion + ' // ' + wantCache);

const clearShareCache = () => page.evaluate(async () => {
  const c = await caches.open('share-target-image');
  const ks = await c.keys();
  await Promise.all(ks.map(k => c.delete(k)));
});
const resetStubs = () => page.evaluate(() => { window.__modals = []; window.__toasts = []; window.__attached = []; });

// 2) Ново споделяне не трие чакащото (POST през service worker-а, приложение, което не взима)
await clearShareCache();
await page.evaluate(async () => {
  const c = await caches.open('share-target-image');
  const put = (k, v) => c.put(k, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } }));
  await put('share-payload-keepme', { sid: 'keepme', title: '', text: 'чакащо', url: '', files: [], ts: Date.now() });
  await c.put('shared-file-keepme-0', new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/jpeg' } }));
  // Приложението не взема нищо: така чакащото остава в кеша, както при затворено приложение.
  window.__origTakePendingShare = takePendingShare;
  window.takePendingShare = async () => null;
});
await page.evaluate(async () => {
  const fd = new FormData();
  fd.append('shared_title', 'Ново');
  fd.append('shared_text', 'ново споделяне');
  try { await fetch('./index.html', { method: 'POST', body: fd }); } catch (e) { window.__postErr = String(e); }
});
await page.waitForTimeout(500);
const afterPost = await page.evaluate(async () => {
  window.takePendingShare = window.__origTakePendingShare;
  const c = await caches.open('share-target-image');
  const names = (await c.keys()).map(k => (new URL(k.url).pathname.split('/').pop() || ''));
  return {
    names,
    keepPayload: names.includes('share-payload-keepme'),
    keepFile: names.includes('shared-file-keepme-0'),
    newPayload: names.some(n => n.startsWith('share-payload-') && n !== 'share-payload-keepme'),
    oldStyleKey: names.includes('share-payload'),
  };
});
check('чакащото споделяне остава при ново', afterPost.keepPayload && afterPost.keepFile, JSON.stringify(afterPost.names));
check('новото споделяне има свой ключ по sid', afterPost.newPayload && !afterPost.oldStyleKey, JSON.stringify(afterPost.names));

// 3) Сливане на всички чакащи в една бележка
await clearShareCache();
const merged = await page.evaluate(async () => {
  const c = await caches.open('share-target-image');
  const put = (k, v) => c.put(k, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } }));
  const now = Date.now();
  await put('share-payload-s1', { sid: 's1', title: 'Едно', text: 'първи', url: '', files: [], ts: now - 2000 });
  await put('share-payload-s2', { sid: 's2', title: '', text: 'втори', url: 'https://ex.com/page', files: [{ key: 'shared-file-s2-0', name: 'a.jpg', type: 'image/jpeg' }], ts: now - 1000 });
  await put('share-payload', { sid: 'legacy', title: '', text: 'стар формат', url: '', files: [], ts: now });
  const out = await takePendingShare();
  const left = (await c.keys()).filter(k => /share-payload/.test(k.url)).length;
  return { out, left };
});
const m = merged.out || {};
check('всички чакащи влизат в една бележка', (m.sids || []).length === 3 && /първи/.test(m.shared_text || '') && /втори/.test(m.shared_text || '') && /стар формат/.test(m.shared_text || ''), JSON.stringify(merged.out));
check('файл от чакащо споделяне стига до бележката', m.shared_image === '1' && (m.files || []).length === 1, JSON.stringify(m.files));
check('след вземане в кеша не остава чакащо', merged.left === 0, String(merged.left));

// 4) Търсеното по sid води
await clearShareCache();
const bySid = await page.evaluate(async () => {
  const c = await caches.open('share-target-image');
  const put = (k, v) => c.put(k, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } }));
  const now = Date.now();
  await put('share-payload-a', { sid: 'a', title: '', text: 'стар', url: '', files: [], ts: now - 2000 });
  await put('share-payload-b', { sid: 'b', title: '', text: 'нов', url: '', files: [], ts: now });
  const out = await takePendingShare('b');
  return out;
});
check('търсеното по sid води, другото не се губи', bySid && bySid.sid === 'b' && (bySid.sids || []).length === 2 && (bySid.shared_text || '').indexOf('нов') < (bySid.shared_text || '').indexOf('стар'), JSON.stringify(bySid));

// 5) restorePendingShare слага под ключа на самото споделяне
await clearShareCache();
const restored = await page.evaluate(async () => {
  await restorePendingShare({ sid: 'r1', shared_title: '', shared_text: 'върнато', shared_url: '', files: [] });
  const c = await caches.open('share-target-image');
  const names = (await c.keys()).map(k => (new URL(k.url).pathname.split('/').pop() || ''));
  return names;
});
check('върнатото споделяне е под свой ключ', restored.includes('share-payload-r1'), JSON.stringify(restored));

// 6) Споделен файл влиза в бележката веднага (attachFilesToModal), преди запис
await clearShareCache();
await resetStubs();
await page.evaluate(async () => {
  const fd = new FormData();
  fd.append('shared_image', new File([new Uint8Array([1, 2, 3, 4])], 'photo.jpg', { type: 'image/jpeg' }));
  try { await fetch('./index.html', { method: 'POST', body: fd }); } catch (e) { window.__postErr = String(e); }
});
await page.waitForTimeout(1600);
const attachState = await page.evaluate(() => ({ attached: window.__attached, modals: window.__modals.length, toasts: window.__toasts }));
const firstAttach = (attachState.attached[0] || [])[0] || null;
check('споделеният файл отива към бележката веднага', !!firstAttach && firstAttach.name === 'photo.jpg' && firstAttach.type === 'image/jpeg' && firstAttach.size === 4, JSON.stringify(attachState.attached));
check('бележката се отваря със споделеното', attachState.modals > 0, String(attachState.modals));

// 7) Линк към снимка се показва като снимка, служебното заглавие „Action“ пада
await clearShareCache();
await resetStubs();
await page.evaluate(async () => {
  const fd = new FormData();
  fd.append('shared_title', 'Action');
  fd.append('shared_text', 'https://ex.com/photo-1.jpg');
  try { await fetch('./index.html', { method: 'POST', body: fd }); } catch (e) { window.__postErr = String(e); }
});
await page.waitForTimeout(1600);
const imgShare = await page.evaluate(() => ({
  raw: (window.__modals[0] || {}).raw || '',
  card: processNoteContent('https://ex.com/photo-1.jpg', true),
}));
check('служебното заглавие „Action“ не влиза в бележката', imgShare.raw.trim() === 'https://ex.com/photo-1.jpg', JSON.stringify(imgShare.raw));
check('линк към снимка се показва като снимка', /nmd-img-card/.test(imgShare.card) && /nmd-img-shot/.test(imgShare.card), imgShare.card.slice(0, 120));

// 8) Истинско заглавие при линк към снимка остава
await clearShareCache();
await resetStubs();
await page.evaluate(async () => {
  const fd = new FormData();
  fd.append('shared_title', 'Моята снимка');
  fd.append('shared_text', 'https://ex.com/photo-2.jpg');
  try { await fetch('./index.html', { method: 'POST', body: fd }); } catch (e) { window.__postErr = String(e); }
});
await page.waitForTimeout(1600);
const titled = await page.evaluate(() => (window.__modals[0] || {}).raw || '');
check('истинското заглавие остава', /Моята снимка/.test(titled) && /photo-2\.jpg/.test(titled), JSON.stringify(titled));

// 9) Обикновен линк не става снимка
const plainLink = await page.evaluate(() => ({
  modal: processNoteContent('https://ex.com/page.html', true),
  board: renderNoteContent('https://ex.com/page.html'),
}));
check('обикновен линк си остава линк', !/nmd-img-card/.test(plainLink.modal) && !/nmd-img-card/.test(plainLink.board) && /<a /.test(plainLink.board), plainLink.board.slice(0, 100));

// 10) Празно споделяне казва какво да се направи
await clearShareCache();
await resetStubs();
await page.evaluate(async () => {
  const fd = new FormData();
  try { await fetch('./index.html', { method: 'POST', body: fd }); } catch (e) { window.__postErr = String(e); }
});
await page.waitForTimeout(1800);
const emptyShare = await page.evaluate(() => ({
  toasts: window.__toasts,
  langKey: _('shareEmptyReceived'),
  modals: window.__modals.length,
}));
check('при празно споделяне се казва какво да се направи', emptyShare.toasts.some(t => /не пристигна нищо/.test(t)), JSON.stringify(emptyShare.toasts));
check('надписът за празно споделяне е преведен', /не пристигна нищо/.test(String(emptyShare.langKey)), String(emptyShare.langKey));

// 11) Картата е блок в ширината на бележката
const css = await page.evaluate(() => {
  const host = document.createElement('div');
  host.className = 'note-content';
  host.id = '__img_card_probe';
  host.style.position = 'fixed';
  host.style.left = '0';
  host.style.top = '0';
  host.style.width = '320px';
  host.innerHTML = processNoteContent('https://ex.com/photo-3.jpg', true);
  document.body.appendChild(host);
  const card = host.querySelector('.nmd-img-card');
  const shot = host.querySelector('.nmd-img-shot');
  const out = {
    card: card ? getComputedStyle(card).display : 'няма',
    cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
    shot: shot ? getComputedStyle(shot).display : 'няма',
    shotMax: shot ? getComputedStyle(shot).maxWidth : 'няма',
  };
  host.remove();
  return out;
});
check('картата на снимката е блок в ширината на бележката', css.card === 'block' && css.shot === 'block' && css.cardW > 300, JSON.stringify(css));

// 12) Конзола
check('без грешки в конзолата', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверки минават`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
