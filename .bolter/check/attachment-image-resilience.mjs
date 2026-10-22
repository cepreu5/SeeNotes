// Снимки, които "изчезват" при бавна мрежа - същото като в cx-notes (ed728c2), но за main.
// main е VIEWER: няма качване с кламерче, значи няма и "току-що качена снимка от паметта".
// Проверява се, че един неуспех НЕ се приема за "няма такъв файл":
//  1. запис с id в Drive (pathGD) не се търси по име;
//  2. един 500 от Drive при плочката не я оставя празна (повторен опит);
//  3. снимка без id в записа продължава да се намира по име;
//  4. трите места искат ТРИ РАЗЛИЧНИ размера, всяко в своя ред: плочката твърдо =s400 thumbnail
//     (никога самия файл), картинката в текста - =s800 thumbnail, а при провал самия файл,
//     прегледът - thumbnailLink с =s1600, а при провал самия файл;
//  5. кешът на thumbnail-ите не смесва размерите (плочка след преглед пак получава =s400);
//  6. липсващият файл е "липсва", не "недостъпен";
//  7. плочките и картинките в текста се теглят ПАРАЛЕЛНО - брои се колко заявки за thumbnail са
//     едновременно в полет (виж последната част).
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
// IMG_1600FAIL   - thumbnail-ът в размер 1600 дава 403 (счупената миниатюра, която преди показваше
//                  "черно поле"); самият файл работи, значи прегледът пада на него
// IMG_THUMBDEAD  - всички thumbnail размери дават 403, самият файл (?alt=media) работи
// IMG_INLINE_THUMBDEAD - същото за картинката в текста: =s800 е счупен, файлът работи
// IMG_INLINE_MEDIAFAIL - обратното: thumbnail работи, самият файл дава 403 (не бива да се чете)
// IMG_INLINE_NOTHUMB   - метаданните са ок, но thumbnailLink липсва: резервата чете самия файл
// IMG_PAR1..IMG_PAR4   - четири нормални файла за проверката за паралелно теглене
// IMG_GONE       - файлът не съществува: 404 и за метаданните, и за самия файл
// Гърлото на gapi се подменя В СТРАНИЦАТА, защото main търси файловете по име през
// gapi.client.drive.files.list, а не през fetch (виж addInitScript).
const metaCalls = new Map();
const thumbCalls = [];
const altCalls = [];
// Редът на заявките към Drive, за да се види кое се пита ПЪРВО: 'media:ID' | 'thumb:ID' | 'meta:ID'.
const driveSeq = [];
// Колко едновременно в полет: влизащите и излизащите заявки се броят в прихванатия fetch, а
// заявката се задържа DELAY_MS, за да има какво да се види - иначе всичко свършва наведнъж.
let inFlight = 0, inFlightMax = 0;
let DELAY_MS = 0;
const sleepMs = (ms) => new Promise(r => setTimeout(r, ms));

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
    // А този е обратното: thumbnail работи, самият файл дава 403 - картинката в текста не бива да
    // чете файла, след като миниатюрата ѝ е дошла.
    'MediaFailInline.jpg': [{ id: 'IMG_INLINE_MEDIAFAIL', name: 'MediaFailInline.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
    // Метаданните са ок, но thumbnailLink липсва (Drive още не е направил миниатюра): картинката в
    // текста трябва да падне на самия файл.
    'NoThumbInline.jpg': [{ id: 'IMG_INLINE_NOTHUMB', name: 'NoThumbInline.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
    // За проверката за паралелно теглене: четири нормални снимки.
    'Par1.jpg': [{ id: 'IMG_PAR1', name: 'Par1.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
    'Par2.jpg': [{ id: 'IMG_PAR2', name: 'Par2.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
    'Par3.jpg': [{ id: 'IMG_PAR3', name: 'Par3.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
    'Par4.jpg': [{ id: 'IMG_PAR4', name: 'Par4.jpg', modifiedTime: '2026-10-22T10:00:00Z' }],
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
  // Метаданни за thumbnail на конкретен файл (inlineImageThumbUrl - миниатюрата в плочката и
  // резервата на вградената картинка). Прегледът в бележката вече НЕ ги пита.
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const id = decodeURIComponent(meta[1]);
    const c = (metaCalls.get(id) || 0) + 1;
    metaCalls.set(id, c);
    driveSeq.push(`meta:${id}`);
    // Броят на едновременните заявки се мери ТУК: влиза преди задържането, излиза след отговора.
    inFlight++;
    if (inFlight > inFlightMax) inFlightMax = inFlight;
    try {
      if (DELAY_MS) await sleepMs(DELAY_MS);
      if ((id === 'IMG_LATE' || id === 'IMG_INLINE_LATE') && c === 1) {
        return await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      }
      if (id === 'IMG_GONE') return await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      // Файл, на който Drive още не е направил миниатюра: отговорът е ок, но без thumbnailLink.
      if (id === 'IMG_INLINE_NOTHUMB') return await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${id}=s220` }) });
    } finally {
      inFlight--;
    }
  }
  // Самият файл
  const media = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media/);
  if (media) {
    const id = decodeURIComponent(media[1]);
    altCalls.push(id);
    driveSeq.push(`media:${id}`);
    if (id === 'IMG_GONE') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    // Файлът не може да се прочете, но миниатюрата му я има: вградената картинка трябва да я ползва.
    if (id === 'IMG_INLINE_MEDIAFAIL') return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  }
  // thumbnail адресите
  if (url.startsWith('https://thumb.invalid/')) {
    thumbCalls.push(url);
    const m = url.match(/thumb\.invalid\/([^=]+)=s(\d+)/);
    const id = m ? m[1] : '';
    const size = m ? m[2] : '';
    driveSeq.push(`thumb:${id}`);
    // Задържа се само когато се мери паралелността: иначе миниатюрата идва преди следващата да е
    // тръгнала и „едновременно в полет" не значи нищо.
    if (DELAY_MS) await sleepMs(DELAY_MS);
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
  // Паралелността се мери и от страната на приложението: броят се заявките за thumbnail метаданни,
  // които са едновременно в полет, и самите <img> към thumb.invalid. Така числото не зависи от
  // това как Playwright раздава прихванатите заявки - вижда се какво прави самият код.
  window.__flight = { metaNow: 0, metaMax: 0, metaEntered: 0, imgNow: 0, imgMax: 0, imgEntered: 0 };
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (!/fields=thumbnailLink/.test(url)) return origFetch(input, init);
    const f = window.__flight;
    f.metaNow++; f.metaEntered++;
    if (f.metaNow > f.metaMax) f.metaMax = f.metaNow;
    const done = () => { f.metaNow--; };
    return origFetch(input, init).then(r => { done(); return r; }, e => { done(); throw e; });
  };
  // <img> към thumbnail адрес: брои се от задаването на src до load/error.
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(value) {
      if (/^https:\/\/thumb\.invalid\//.test(String(value))) {
        const f = window.__flight;
        f.imgNow++; f.imgEntered++;
        if (f.imgNow > f.imgMax) f.imgMax = f.imgNow;
        let counted = false;
        const done = () => { if (counted) return; counted = true; f.imgNow--; };
        this.addEventListener('load', done, { once: true });
        this.addEventListener('error', done, { once: true });
      }
      return desc.set.call(this, value);
    },
  });
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
// Плочката е миниатюрата, която не се разпъва: тя иска thumbnail, а самият файл не се тегли за нея.
// Проверява се ПРЕДИ кликовете по-долу, защото прегледът след тях иска самия файл.
ok(thumbCalls.length > 0 && altCalls.length === 0,
  'плочките искат само thumbnail, нито веднъж самия файл (?alt=media)', { thumbs: thumbCalls.slice(), alts: altCalls.slice() });
ok(thumbCalls.every(u => u.includes('=s400')), 'плочката иска thumbnail в размера за плочка (=s400)', thumbCalls.slice());

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
      // Готово е само зареденото: <img> със счупен адрес остава complete, но с naturalWidth 0,
      // затова се чака или картинка, или съобщение - иначе се хваща моментът преди резервата.
      if (img && img.complete && img.naturalWidth > 0) return { kind: 'img', loaded: true, src: img.getAttribute('src'), text };
      if (!img && !spinner) return { kind: 'message', loaded: false, src: null, text };
    }
    await new Promise(r => setTimeout(r, 50));
  }
  const overlay = document.querySelector('.image-preview-overlay');
  return { kind: 'timeout', loaded: false, src: overlay && overlay.querySelector('img') ? overlay.querySelector('img').getAttribute('src') : null, text: '' };
});

// 4. Прегледът иска thumbnailLink и показва =s1600. Ако точно =s1600 не се зареди, прегледът не
// угасва - чете самия файл (?alt=media) и показва него.
const metaBefore = metaCalls.get('IMG_1600FAIL') || 0;
const thumbBefore = thumbCalls.length;
await clickTile('S1600Fail.jpg');
const o1 = await readOverlay();
ok((metaCalls.get('IMG_1600FAIL') || 0) === metaBefore + 1,
  'преглед: първо се иска thumbnailLink (fields=thumbnailLink)', metaCalls.get('IMG_1600FAIL'));
ok(thumbCalls.slice(thumbBefore).includes('https://thumb.invalid/IMG_1600FAIL=s1600'),
  'преглед: иска се thumbnail точно в размера за преглед (=s1600)', thumbCalls.slice(thumbBefore));
ok(o1.kind === 'img' && o1.loaded, 'преглед: показва се снимка, не черно поле', o1);
ok(String(o1.src).startsWith('blob:'), 'преглед: счупен =s1600 -> самият файл (blob URL)', o1.src);
ok(altCalls.includes('IMG_1600FAIL'), 'преглед: резервата е самият файл (?alt=media)', altCalls.slice());

// 5. Първият път thumbnailLink се показва както е (=s1600): тук 1600 работи, значи файлът НЕ се
// чете - точно това е печалбата от големия thumbnail.
const altBefore5 = altCalls.length;
await clickTile('Ok.jpg');
const o2 = await readOverlay();
ok(o2.kind === 'img' && o2.loaded && String(o2.src) === 'https://thumb.invalid/IMG_OK=s1600',
  'преглед: показва се thumbnail адресът, смален до =s1600', o2);
ok(altCalls.length === altBefore5, 'преглед: щом thumbnail работи, самият файл не се тегли', altCalls.slice());

// 6. Файлът наистина го няма: съобщение с думи, не липсваща картинка.
await clickTile('Gone.jpg');
const o3 = await readOverlay();
ok(o3.kind === 'message' && !o3.loaded, 'преглед: липсващ файл дава съобщение, не счупена картинка', o3);
ok(o3.text && o3.text.length > 0, 'преглед: съобщението има текст за човека', o3);
ok((metaCalls.get('IMG_GONE') || 0) >= 1 && altCalls.includes('IMG_GONE'),
  'преглед: пита и thumbnailLink, и самия файл, преди да каже, че го няма', { meta: metaCalls.get('IMG_GONE'), alts: altCalls.slice() });

// --- Вградена картинка в текста (type=8): същата устойчивост --------------------------------
const inline = await page.evaluate(async () => {
  const sentence = 'Може да добавите всяка бележка на * началния екран * като widget и * още * нещо * тук * плюс';
  const stars = [];
  for (let i = 0; i < sentence.length; i++) if (sentence[i] === '*') stars.push(i);
  const files = ['LateInline.jpg', 'Gone.jpg', 'FlakySearch.jpg', 'ThumbDeadInline.jpg', 'MediaFailInline.jpg', 'NoThumbInline.jpg'];
  const widths = [4, 4, 3, 3, 4, 3];
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
const mediaFailInline = row('MediaFailInline.jpg');
const noThumbInline = row('NoThumbInline.jpg');

// 7. Вградената картинка: един 500 при търсенето по име не значи "липсва", липсващият файл е
// missing, а картинката се показва от thumbnail =s800.
ok(lateInline.state === 'ready' && lateInline.loaded,
  'вградена картинка: един 500 от Drive не я оставя празна (повторен опит)', inline);
ok(goneInline.state === 'missing',
  'вградена картинка: липсващият файл е "липсва", не "недостъпен"', goneInline);
ok(flakyInline.state === 'ready' && flakyInline.loaded,
  'вградена картинка: едно паднало търсене по име не значи "няма такъв файл"', flakyInline);
ok(String(lateInline.src).includes('=s800') && String(flakyInline.src).includes('=s800'),
  'вградена картинка: иска се thumbnail в размера за текст (=s800)', { late: lateInline.src, flaky: flakyInline.src });

// 8. Резервата: счупен =s800 и липсващ thumbnailLink водят до самия файл, а не до празна рамка.
ok(deadThumbInline.state === 'ready' && deadThumbInline.loaded && String(deadThumbInline.src).startsWith('blob:'),
  'вградена картинка: счупен =s800 -> показва се самият файл (blob URL)', deadThumbInline);
ok(altCalls.includes('IMG_INLINE_THUMBDEAD'),
  'вградена картинка: резервата е ?alt=media', altCalls.slice());
ok(noThumbInline.state === 'ready' && noThumbInline.loaded && String(noThumbInline.src).startsWith('blob:'),
  'вградена картинка: няма thumbnailLink -> показва се самият файл', noThumbInline);
ok(altCalls.includes('IMG_INLINE_NOTHUMB'), 'вградена картинка: и тук резервата е ?alt=media', altCalls.slice());

// 9. Обратното правило: щом thumbnail работи, файлът НЕ се тегли - иначе една бележка с десет
// снимки би теглила десет пълни файла за картинки по 200 пиксела.
ok(mediaFailInline.state === 'ready' && mediaFailInline.loaded && String(mediaFailInline.src).includes('thumb.invalid'),
  'вградена картинка: показва се thumbnail, когато той работи', mediaFailInline);
ok(!altCalls.includes('IMG_INLINE_MEDIAFAIL'),
  'вградена картинка: щом thumbnail работи, самият файл не се чете', altCalls.slice());

// 10. Кешът пази размера в ключа: плочка (=s400), преглед (=s1600) и пак плочка не си пречат.
const cacheMix = await page.evaluate(async () => {
  inlineImageThumbCache.clear();
  const tile = await inlineImageThumbUrl('IMG_1600FAIL');             // плочка - подразбирано 400
  const preview = await inlineImageThumbUrl('IMG_1600FAIL', 1600);    // преглед
  const tileAgain = await inlineImageThumbUrl('IMG_1600FAIL');        // пак плочка
  return { tile, preview, tileAgain, keys: [...inlineImageThumbCache.keys()] };
});
ok(cacheMix.tile === 'https://thumb.invalid/IMG_1600FAIL=s400' && cacheMix.preview === 'https://thumb.invalid/IMG_1600FAIL=s1600',
  'кеш: всеки размер получава своя адрес (=s400 за плочка, =s1600 за преглед)', cacheMix);
ok(cacheMix.tileAgain === cacheMix.tile,
  'кеш: плочка след преглед пак получава =s400, не адреса на прегледа', cacheMix);
ok(cacheMix.keys.length === 2 && cacheMix.keys.every(k => k.startsWith('IMG_1600FAIL=s')),
  'кеш: ключът е fileId + размер, значи два размера - два записа', cacheMix.keys);

// --- Паралелно теглене: колко thumbnail заявки са едновременно в полет -----------------------
// Собственикът (22.10): при първо отваряне на бележка картинките се запълват една по една.
// Числото се мери два пъти: в прихванатия fetch (влизащи/излезащи заявки, както е в брифа) и в
// самата страница (брояч около fetch за метаданните и около src на <img>). Заявките се задържат
// 150 мс, за да има какво да се види - иначе всичко свършва наведнъж и максимумът е безсмислен.
const PAR_FILES = ['Par1.jpg', 'Par2.jpg', 'Par3.jpg', 'Par4.jpg'];
DELAY_MS = 150;

const resetFlight = () => page.evaluate(() => {
  const f = window.__flight;
  f.metaNow = 0; f.metaMax = 0; f.metaEntered = 0;
  f.imgNow = 0; f.imgMax = 0; f.imgEntered = 0;
  inlineImageThumbCache.clear();
  inlineImageFileCache.clear();
});

// 11. Картинките в текста: бележка с четири снимки.
await resetFlight();
inFlight = 0; inFlightMax = 0;
const parInline = await page.evaluate(async (files) => {
  const sentence = 'снимки: * * * * край';
  const stars = [];
  for (let i = 0; i < sentence.length; i++) if (sentence[i] === '*') stars.push(i);
  const format = files.map((f, i) => JSON.stringify({
    start: stars[i], end: stars[i] + 1, type: 8,
    paramstring: `/storage/emulated/0/Download/Images/${f}`, paramint: 2,
  })).join('|');
  let host = document.getElementById('inline-img-par-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'inline-img-par-host';
    document.body.appendChild(host);
  }
  host.style.cssText = 'position:fixed;left:0;top:0;width:600px;z-index:99999;background:#fff;';
  host.innerHTML = formatText(sentence, format, true);
  hydrateInlineImages(host);
  const deadline = performance.now() + 20000;
  const read = () => [...host.querySelectorAll('.nm-inline-img')].map(b => {
    const img = b.querySelector('img');
    return { file: b.dataset.nmFile, state: b.dataset.nmState, loaded: !!img && img.complete && img.naturalWidth > 0 };
  });
  while (performance.now() < deadline) {
    const rows = read();
    if (rows.length >= files.length && rows.every(r => r.state !== 'loading')) return rows;
    await new Promise(r => setTimeout(r, 30));
  }
  return read();
}, PAR_FILES);
const flightInline = await page.evaluate(() => ({ ...window.__flight }));
const routeInlineMax = inFlightMax;
const parInlineShown = parInline.filter(r => r.loaded).length;

// 12. Плочките: същите четири снимки, но прикачени - вторият път, по който се тегли thumbnail.
await resetFlight();
inFlight = 0; inFlightMax = 0;
const PARATT = PAR_FILES.map((f, i) => ({ noteid: 'P1', path: f, pathGD: `IMG_PAR${i + 1}`, type: 1 }));
await page.evaluate((all) => {
  window.__PARATT = all;
  const base = window.__ensureAtt;
  window.__ensureAtt = () => {
    base();
    for (const a of all) {
      const same = mediaData.some(m => m.noteid === a.noteid && m.path === a.path && (m.pathGD || '') === (a.pathGD || ''));
      if (!same) mediaData.push(a);
    }
  };
}, PARATT);
const parCount = await page.evaluate(async () => {
  window.__ensureAtt();
  showModal({ raw: 'четири прикачени снимки', format: null, gdid: 'P1' });
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    const tiles = [...document.querySelectorAll('#modal-body .nm-attach-tile')];
    if (tiles.length >= 4 && tiles.every(t => t.dataset.state === 'ready')) return tiles.length;
    await new Promise(r => setTimeout(r, 30));
  }
  return document.querySelectorAll('#modal-body .nm-attach-tile').length;
});
const flightTiles = await page.evaluate(() => ({ ...window.__flight }));
const routeTilesMax = inFlightMax;
const parTilesReady = await page.evaluate(() => [...document.querySelectorAll('#modal-body .nm-attach-tile')]
  .filter(t => t.dataset.state === 'ready').length);
DELAY_MS = 0;

console.log(`паралелност: картинки в текста - едновременни метаданни ${flightInline.metaMax} (страница) / ${routeInlineMax} (fetch), едновременни <img> ${flightInline.imgMax}, показани ${parInlineShown}/4`);
console.log(`паралелност: плочки - едновременни метаданни ${flightTiles.metaMax} (страница) / ${routeTilesMax} (fetch), едновременни <img> ${flightTiles.imgMax}, готови ${parTilesReady}/4`);

ok(parInlineShown === 4, 'паралелно: четирите картинки в текста се показват', parInline);
ok(flightInline.metaMax > 1 && routeInlineMax > 1,
  'паралелно: картинките в текста се теглят едновременно, не една по една',
  { page: flightInline, route: routeInlineMax });
ok(flightInline.metaMax >= 3, 'паралелно: в текста са в полет поне 3 от 4 заявки наведнъж', flightInline);
ok(flightInline.imgMax >= 3, 'паралелно: и самите картинки се теглят наведнъж, не една подир друга', flightInline);
ok(parTilesReady === 4 && flightTiles.metaMax > 1 && routeTilesMax > 1,
  'паралелно: плочките също се теглят едновременно',
  { page: flightTiles, route: routeTilesMax, ready: parTilesReady, count: parCount });
ok(flightTiles.metaMax >= 3, 'паралелно: при плочките са в полет поне 3 от 4 заявки наведнъж', flightTiles);
ok(flightTiles.imgMax >= 3, 'паралелно: и самите миниатюри на плочките се теглят наведнъж', flightTiles);

ok(errs.length === 0, `няма грешки в конзолата (${errs.length})`, errs.slice(0, 3));

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
