// Снимки, които "изчезват" при бавна мрежа - същото като в cx-notes (ed728c2), но за main.
// main е VIEWER: няма качване с кламерче, значи няма и "току-що качена снимка от паметта".
// Проверява се, че един неуспех НЕ се приема за "няма такъв файл":
//  1. запис с id в Drive (pathGD) не се търси по име;
//  2. един 500 от Drive при плочката не я оставя празна (повторен опит);
//  3. снимка без id в записа продължава да се намира по име;
//  4. прегледът взима адрес, който наистина се зарежда: голям thumbnail → thumbnail както е даден →
//     самият файл (?alt=media), вместо черно поле с липсваща картинка;
//  5. вградената картинка в текста (type=8) също издържа един неуспешен отговор, а липсващият файл
//     е "липсва", не "недостъпен".
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/attachment-image-resilience.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // main-овото приложение е index-2.html (то зарежда main.js); index.html е само splash.
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel.endsWith('mainn.js') ? rel.slice(0, -'mainn.js'.length) + 'main.js' : rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

// Истинска 1x1 PNG: така naturalWidth > 0 значи "картинката наистина се зареди".
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// --- Фалшивият Drive: по един файл за всяко поведение ---------------------------------------
// IMG_OK         - нормален файл, thumbnail на всякакъв размер работи
// IMG_LATE       - първите метаданни за thumbnail отговарят 500, после 200 (бавна мрежа)
// IMG_BYNAME     - намира се само по име (записът няма id)
// IMG_1600FAIL   - =s1600 дава 403, оригиналният размер работи (така изглежда "черното поле")
// IMG_THUMBDEAD  - всички thumbnail размери дават 403, самият файл (?alt=media) работи
// IMG_GONE       - файлът не съществува: 404 и за метаданните, и за самия файл
// Гърлото на gapi се подменя В СТРАНИЦАТА, защото main търси файловете по име през
// gapi.client.drive.files.list, а не през fetch (виж addInitScript).
const metaCalls = new Map();
const thumbCalls = [];
const altCalls = [];

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });

await ctx.addInitScript(() => {
  const F_DATA = 'FOLDER_MULTINOTES_DATA', F_IMAGES = 'FOLDER_IMAGES';
  const BY_NAME = {
    'ByName.jpg': [{ id: 'IMG_BYNAME', name: 'ByName.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
    'LateInline.jpg': [{ id: 'IMG_INLINE_LATE', name: 'LateInline.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
    // Търсенето по име пада веднъж (500) - файлът все пак трябва да се намери.
    'FlakySearch.jpg': [{ id: 'IMG_SEARCH_FLAKY', name: 'FlakySearch.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
    // Този има само мъртви thumbnail-и: вградената картинка трябва да дойде от самия файл.
    'ThumbDeadInline.jpg': [{ id: 'IMG_INLINE_THUMBDEAD', name: 'ThumbDeadInline.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
  };
  // Колко пъти е търсено име: по това се вижда дали запис с id е питал Drive изобщо.
  window.__drive = { searches: [], counts: {} };
  window.gapi = {
    load() { },
    client: {
      setToken() { },
      getToken() { return { access_token: 'tok' }; },
      drive: {
        files: {
          list(params) {
            const q = (params || {}).q || '';
            if (/\bin parents\b/i.test(q)) {
              if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
                const fname = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
                return Promise.resolve({ result: { files: fname === 'Images' ? [{ id: F_IMAGES, name: 'Images' }] : [] } });
              }
              const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
              window.__drive.searches.push(name);
              const seen = (window.__drive.counts[name] = (window.__drive.counts[name] || 0) + 1);
              if (name === 'FlakySearch.jpg' && seen === 1) {
                // 500 от Drive: един неуспешен отговор, който НЕ значи "няма такъв файл".
                return Promise.reject(new Error('Internal Error 500'));
              }
              return Promise.resolve({ result: { files: BY_NAME[name] || [] } });
            }
            if (/name\s*=\s*'multinotes_data'/.test(q)) {
              return Promise.resolve({ result: { files: [{ id: F_DATA, name: 'multinotes_data' }] } });
            }
            return Promise.resolve({ result: { files: [] } });
          },
          get(params) {
            return Promise.resolve({ result: { thumbnailLink: `https://thumb.invalid/${(params || {}).fileId}=s220` } });
          },
        },
      },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
});

await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const url = route.request().url();
  // Метаданни за thumbnail на конкретен файл (inlineImageThumbUrl / прегледът в бележката).
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const id = decodeURIComponent(meta[1]);
    const c = (metaCalls.get(id) || 0) + 1;
    metaCalls.set(id, c);
    if ((id === 'IMG_LATE' || id === 'IMG_INLINE_LATE') && c === 1) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    }
    if (id === 'IMG_GONE') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${id}=s220` }) });
  }
  // Самият файл
  const media = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media/);
  if (media) {
    const id = decodeURIComponent(media[1]);
    altCalls.push(id);
    if (id === 'IMG_GONE') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  }
  // thumbnail адресите
  if (url.startsWith('https://thumb.invalid/')) {
    thumbCalls.push(url);
    const m = url.match(/thumb\.invalid\/([^=]+)=s(\d+)/);
    const id = m ? m[1] : '';
    const size = m ? m[2] : '';
    if (id === 'IMG_THUMBDEAD' || id === 'IMG_INLINE_THUMBDEAD') return route.fulfill({ status: 403, contentType: 'image/png', body: '' });
    if (id === 'IMG_1600FAIL' && size === '1600') return route.fulfill({ status: 403, contentType: 'image/png', body: '' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  // Ko-fi приставката на index-2.html: без нея inline скриптът на страницата хвърля
  // "kofiWidgetOverlay is not defined" - чужда грешка, която няма нищо общо с проверката.
  if (url.startsWith('https://storage.ko-fi.com/')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});

// Помощните скриптове на main (kb-assistant.js, msmrt.js) не участват в проверката и без логин
// само биха добавили чужди грешки в конзолата.
const page = await ctx.newPage();
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.addInitScript(() => {
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof showModal === 'function'
  && typeof buildAttachmentTile === 'function' && typeof hydrateInlineImages === 'function'
  && typeof formatText === 'function', null, { timeout: 20000 });

// Минималното състояние, което рендерът на main очаква (както в modal-attachment-tiles.mjs).
await page.evaluate(() => {
  contentModal = document.getElementById('content-modal');
  modalBody = document.getElementById('modal-body');
  copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
  useArhDb = false;
  useLocalFolder = false;
  useGoogleDb = true;
  useIndexedDb = false;
  dbSourceGlobal = null;
  dirHandle = null;
  isOfflineMode = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  localStorage.setItem('lang', currentLang || 'bg');
});

// --- Прикачени снимки: по една на поведение ------------------------------------------------
const ATT = [
  { noteid: 'G1', path: 'Ok.jpg', pathGD: 'IMG_OK', type: 1 },
  { noteid: 'G1', path: 'Late.jpg', pathGD: 'IMG_LATE', type: 1 },
  { noteid: 'G1', path: 'ByName.jpg', pathGD: '', type: 1 },
  { noteid: 'G1', path: 'S1600Fail.jpg', pathGD: 'IMG_1600FAIL', type: 1 },
  { noteid: 'G1', path: 'ThumbDead.jpg', pathGD: 'IMG_THUMBDEAD', type: 1 },
  { noteid: 'G1', path: 'Gone.jpg', pathGD: 'IMG_GONE', type: 1 },
];
// Приложението си има фонова синхронизация, която подменя mediaData след старта (в проверката
// няма истински Drive, значи списъкът ѝ е празен). Записите на бележката се връщат точно преди
// четенето им - и при отварянето на модала, и при клика, - за да е пътят същият като в приложението.
await page.evaluate((all) => {
  window.__ATT = all;
  window.__ensureAtt = () => {
    for (const a of all) {
      const same = mediaData.some(m => m.noteid === a.noteid && m.path === a.path && (m.pathGD || '') === (a.pathGD || ''));
      if (!same) mediaData.push(a);
    }
  };
  window.__ensureAtt();
}, ATT);

const openModal = () => page.evaluate(async () => {
  window.__ensureAtt();
  showModal({ raw: 'тестова бележка с прикачени снимки', format: null, gdid: 'G1' });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const count = document.querySelectorAll('#modal-body .nm-attach-tile').length;
    if (count >= 6) return count;
    await new Promise(r => setTimeout(r, 30));
  }
  return document.querySelectorAll('#modal-body .nm-attach-tile').length;
});

// Чака се, докато всяка плочка излезе от "чака" - готово изображение или окончателно състояние.
const waitTiles = () => page.evaluate(async () => {
  const deadline = performance.now() + 15000;
  const read = () => [...document.querySelectorAll('#modal-body .nm-attach-tile')].map(t => {
    const img = t.querySelector('.nm-attach-tile-photo img');
    return {
      label: (t.getAttribute('aria-label') || '').split('\n')[0],
      state: t.dataset.state,
      hasPhoto: !!img,
      loaded: !!img && img.complete && img.naturalWidth > 0,
      src: img ? img.getAttribute('src') : null,
    };
  });
  while (performance.now() < deadline) {
    const rows = read();
    if (rows.length && rows.every(r => r.state === 'ready' || r.state === 'missing' || r.state === 'unavailable')) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  return read();
});

const count = await openModal();
ok(count === ATT.length, `всичките ${ATT.length} плочки са на място (${count})`);
const tiles = await waitTiles();
const tile = (name) => tiles.find(t => t.label === name) || {};

// 1. Запис с id не се търси по име: в таблицата по име няма 'Ok.jpg', значи намирането е по id.
const searches = await page.evaluate(() => window.__drive.searches.slice());
ok(tile('Ok.jpg').state === 'ready' && tile('Ok.jpg').loaded, 'плочка с id в Drive показва снимката', tile('Ok.jpg'));
ok(!searches.includes('Ok.jpg'), 'плочка с id в Drive не пита Drive по име', searches);
// 2. Един 500 не значи "няма файл": след повторния опит снимката е на място.
ok(tile('Late.jpg').state === 'ready' && tile('Late.jpg').loaded,
  'плочката преживява един 500 от Drive (повторен опит)', tile('Late.jpg'));
ok((metaCalls.get('IMG_LATE') || 0) >= 2, 'плочката е питала Drive повторно след 500', metaCalls.get('IMG_LATE'));
// 3. Снимка без id в записа продължава да се търси по име.
ok(tile('ByName.jpg').state === 'ready' && tile('ByName.jpg').loaded, 'снимка без id се намира по име', tile('ByName.jpg'));
ok(searches.includes('ByName.jpg'), 'снимка без id е потърсена по име', searches);

// --- Прегледът при клик: адресът, който наистина се зарежда --------------------------------
const clickTile = (label) => page.evaluate(async (label) => {
  window.__ensureAtt();
  document.querySelectorAll('.image-preview-overlay').forEach(o => o.remove());
  const t = [...document.querySelectorAll('#modal-body .nm-attach-tile')].find(x => (x.getAttribute('aria-label') || '').split('\n')[0] === label);
  if (!t) return 'no-tile';
  t.click();
  return 'clicked';
}, label);

const readOverlay = () => page.evaluate(async () => {
  const deadline = performance.now() + 20000;
  while (performance.now() < deadline) {
    const overlay = document.querySelector('.image-preview-overlay');
    if (overlay) {
      const img = overlay.querySelector('img');
      const spinner = overlay.querySelector('.loader');
      const text = overlay.textContent.trim();
      if (img && img.complete) return { kind: 'img', loaded: img.naturalWidth > 0, src: img.getAttribute('src'), text };
      if (!img && !spinner) return { kind: 'message', loaded: false, src: null, text };
    }
    await new Promise(r => setTimeout(r, 50));
  }
  const overlay = document.querySelector('.image-preview-overlay');
  return { kind: 'timeout', loaded: false, src: overlay && overlay.querySelector('img') ? overlay.querySelector('img').getAttribute('src') : null, text: '' };
});

// 4. =s1600 дава 403, оригиналният размер работи: overlay-ът показва снимката, не черно поле.
await clickTile('S1600Fail.jpg');
const o1 = await readOverlay();
ok(o1.kind === 'img' && o1.loaded, 'преглед: счупен =s1600 се замества с адрес, който се зарежда', o1);
ok(String(o1.src).includes('IMG_1600FAIL=s220'), 'преглед: показан е по-малкият thumbnail от Drive', o1.src);
ok(thumbCalls.some(u => u.includes('IMG_1600FAIL=s1600')) && thumbCalls.some(u => u.includes('IMG_1600FAIL=s220')),
  'преглед: пробвани са и двата размера, преди да се покаже картинката', thumbCalls.filter(u => u.includes('IMG_1600FAIL')));

// 5. Нито един thumbnail не работи: идва самият файл, пак картинка.
await clickTile('ThumbDead.jpg');
const o2 = await readOverlay();
ok(o2.kind === 'img' && o2.loaded && String(o2.src).startsWith('blob:'), 'преглед: при мъртви thumbnail-и снимката идва от самия файл (blob URL)', o2);
ok(altCalls.includes('IMG_THUMBDEAD'), 'преглед: поискан е самият файл (?alt=media)', altCalls);

// 6. Файлът наистина го няма: съобщение с думи, не липсваща картинка.
await clickTile('Gone.jpg');
const o3 = await readOverlay();
ok(o3.kind === 'message' && !o3.loaded, 'преглед: липсващ файл дава съобщение, не счупена картинка', o3);
ok(o3.text && o3.text.length > 0, 'преглед: съобщението има текст за човека', o3);

// --- Вградена картинка в текста (type=8): същата устойчивост --------------------------------
const inline = await page.evaluate(async () => {
  const sentence = 'Може да добавите всяка бележка на * началния екран * като widget и * още * нещо';
  const stars = [];
  for (let i = 0; i < sentence.length; i++) if (sentence[i] === '*') stars.push(i);
  const files = ['LateInline.jpg', 'Gone.jpg', 'FlakySearch.jpg', 'ThumbDeadInline.jpg'];
  const widths = [4, 4, 3, 3];
  const format = files.map((f, i) => JSON.stringify({
    start: stars[i], end: stars[i] + 1, type: 8,
    paramstring: `/storage/emulated/0/Download/Images/${f}`, paramint: widths[i],
  })).join('|');
  let host = document.getElementById('inline-img-probe-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'inline-img-probe-host';
    document.body.appendChild(host);
  }
  host.style.cssText = 'position:fixed;left:0;top:0;width:600px;z-index:99999;background:#fff;';
  host.innerHTML = formatText(sentence, format, true);
  hydrateInlineImages(host);
  const deadline = performance.now() + 20000;
  const read = () => [...host.querySelectorAll('.nm-inline-img')].map(b => {
    const img = b.querySelector('img');
    return { file: b.dataset.nmFile, state: b.dataset.nmState, loaded: !!img && img.complete && img.naturalWidth > 0, src: img ? img.getAttribute('src') : null };
  });
  while (performance.now() < deadline) {
    const rows = read();
    if (rows.length >= files.length && rows.every(r => r.state !== 'loading')) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  return read();
});
const row = (name) => inline.find(r => r.file === name) || {};
const lateInline = row('LateInline.jpg');
const goneInline = row('Gone.jpg');
const flakyInline = row('FlakySearch.jpg');
const deadThumbInline = row('ThumbDeadInline.jpg');

// 7. Вградената картинка: един 500 при търсенето по име не значи "липсва", липсващият файл е
// missing, а мъртвите thumbnail-и дават самия файл.
ok(lateInline.state === 'ready' && lateInline.loaded,
  'вградена картинка: един 500 от Drive не я оставя празна (повторен опит)', inline);
ok(goneInline.state === 'missing',
  'вградена картинка: липсващият файл е "липсва", не "недостъпен"', goneInline);
ok(flakyInline.state === 'ready' && flakyInline.loaded,
  'вградена картинка: едно паднало търсене по име не значи "няма такъв файл"', flakyInline);
ok(deadThumbInline.state === 'ready' && deadThumbInline.loaded && String(deadThumbInline.src).startsWith('blob:'),
  'вградена картинка: при мъртви thumbnail-и идва самият файл (blob URL)', deadThumbInline);

ok(errs.length === 0, `няма грешки в конзолата (${errs.length})`, errs.slice(0, 3));

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
