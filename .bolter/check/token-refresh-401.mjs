// Изтекъл токен в прегледа на прикачен файл (собственикът, 21.10.2026): „Thumbnail fetch failed: 401"
// за приложените файлове, а след Refresh изчезва. Причината не е Drive, а живота на сесията:
//   1. когато токенът е изтекъл, прегледът вика checkAuth() и записва ОБВИВКАТА { pass, tokenData }
//      в authToken, вместо tokenData - хедърът излиза 'Bearer undefined' и Drive отговаря 401;
//   2. при 401 в прегледа няма нито опресняване, нито повторен опит;
//   3. провалът на inlineImageThumbUrl остава в кеша за цялата сесия, значи картинката не се
//      оправя дори след като токенът вече е опреснен.
// Проверява се през ИСТИНСКИЯ път на собственика: карта с прикачена снимка (type=1), клик на името
// в картата, който вика showInNotePreview. gapi и Google Identity Services се заместват в
// страницата; Drive отговаря 401 за стария токен и 200 за новия. serviceWorkers се блокира, за да
// не пречи кешът на приложението.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/token-refresh-401.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Приложението е index-2.html (то зарежда main.js); index.html е само splash.
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

const OLD_TOKEN = 'OLD_TOKEN';   // „изтеклият" токен: Drive отговаря 401 за него
const NEW_TOKEN = 'NEW_TOKEN';   // каквото връща „тихото" опресняване

// Всяка заявка към Drive, с хедъра, който наистина е тръгнал.
const REQS = [];

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });

// gapi и Google Identity Services се заместват В СТРАНИЦАТА, преди main.js да тръгне:
// refreshAuthToken чака google.accounts.oauth2 и после вика initTokenClient().requestAccessToken(),
// чийто callback връща новия токен - точно това прави и истинският GIS, но без прозорец.
await ctx.addInitScript(() => {
  window.__auth = { mode: 'ok', newToken: 'NEW_TOKEN', refreshCalls: 0, lastConfig: null };
  window.gapi = {
    load() { },
    client: {
      setToken() { },
      getToken() { return { access_token: 'TOKEN_FROM_GAPI' }; },
      drive: {
        files: {
          list() { return Promise.resolve({ result: { files: [] } }); },
          get() { return Promise.resolve({ result: {} }); },
        },
      },
    },
    auth: { getToken() { return { access_token: 'TOKEN_FROM_GAPI' }; } },
  };
  window.google = {
    accounts: {
      id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } },
      oauth2: {
        initTokenClient(config) {
          window.__auth.lastConfig = { client_id: config && config.client_id };
          return {
            requestAccessToken() {
              window.__auth.refreshCalls++;
              const mode = window.__auth.mode;
              // Асинхронно, както при истинския GIS: callback-ът идва след requestAccessToken.
              setTimeout(() => {
                if (mode === 'ok') config.callback({ access_token: window.__auth.newToken, expires_in: 3599 });
                else if (mode === 'empty') config.callback({});                       // без токен
                else config.callback({ error: 'interaction_required' });              // отказ
              }, 0);
            },
          };
        },
        hasGrantedAllScopes() { return false; },
      },
    },
  };
});

await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const req = route.request();
  const url = req.url();
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
  // 1. Метаданни за thumbnail (fields=thumbnailLink) и самият файл (alt=media) - със токена.
  const drive = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)/);
  if (drive) {
    const fileId = decodeURIComponent(drive[1]);
    const auth = req.headers()['authorization'] || '';
    REQS.push({ fileId, auth, url: url.replace(/\?.*$/, '') });
    // Само НОВИЯТ токен е валиден: старият, липсващият и 'Bearer undefined' получават 401 -
    // точно това вижда и собственикът, когато хедърът тръгне с обвивката вместо с токена.
    if (auth === `Bearer ${NEW_TOKEN}`) {
      return route.fulfill({
        status: 200, headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s220` }),
      });
    }
    return route.fulfill({
      status: 401, headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ error: { code: 401, status: 'UNAUTHENTICATED' } }),
    });
  }
  // 2. Самата картинка по thumbnailLink.
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c6d2e4"/></svg>';
    return route.fulfill({ status: 200, headers: cors, contentType: 'image/svg+xml', body: svg });
  }
  // 3. GIS клиентът: window.google вече е сложен от addInitScript, скриптът не пипа нищо.
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* google stub: виж addInitScript */' });
  }
  // Ko-fi приставката на index-2.html: без нея inline скриптът хвърля чужда грешка.
  if (url.startsWith('https://storage.ko-fi.com/')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});

const page = await ctx.newPage();
// Помощните скриптове на main не участват в проверката и без логин само биха добавили грешки.
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
// alert() в checkAuth при провален refresh: в проверката просто се затваря.
page.on('dialog', d => d.dismiss().catch(() => { }));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof createNoteElement === 'function'
  && typeof showInNotePreview === 'function' && typeof inlineImageThumbUrl === 'function', null, { timeout: 20000 });

// ======================= 1. Изтекъл токен: прегледът пак показва снимката =======================
const before1 = REQS.length;
const r1 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // Изтекъл токен в двата storage-а - точно състоянието, в което собственикът вижда 401.
  const OLD = { access_token: 'OLD_TOKEN', issued_at: Date.now() - 4 * 60 * 60 * 1000, expires_in: 3599, email_hint: 'x@y' };
  sessionStorage.setItem('google_auth_token', JSON.stringify(OLD));
  localStorage.setItem('google_auth_token', JSON.stringify(OLD));
  // Без login hint няма „тих" refresh - тогава checkAuth праща на логин и до Drive не се стига.
  localStorage.setItem('google_login_hint', 'owner@example.com');
  localStorage.setItem('oneTapLink', 'true');
  // Езикът се задава и в двата ключа, които приложението чете, и се презарежда речникът.
  localStorage.setItem('language', 'bg');
  localStorage.setItem('lang', 'bg');
  currentLang = 'bg';
  delete appTranslations['bg'];
  window.__auth.mode = 'ok';
  window.__auth.newToken = 'NEW_TOKEN';
  // Режим Drive - същият, в който собственикът вижда снимките.
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  isOfflineMode = false;
  dirHandle = null;
  authToken = { ...OLD };
  mediaData.push({ noteid: 'G1', path: 'Wallet.jpg', pathGD: 'WALLET_NEW', type: 1 });

  let host = document.getElementById('preview-probe-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'preview-probe-host';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  host.style.cssText = 'position:fixed;left:0;top:0;width:520px;height:600px;display:flex;flex-direction:column;gap:8px;z-index:99999;background:#fff;';
  const id = 960001;
  const nt = {
    alarm_type: -1, boardid: 'probe-board', calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
    eventId: 0, gdid: 'G1', id, notetxt: 'бележка с прикачена снимка', numord: id, sellist: 0, status: 0,
    text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
  };
  allNotesData.push(nt);
  const el = await createNoteElement(nt);
  el.style.display = 'flex';
  host.appendChild(el);
  window.__probeEl = el;
  await sleep(150);
  // Истинският път на собственика: клик на името на прикачения файл в картата.
  const link = [...el.querySelectorAll('.note-content a')].find(a => a.textContent.includes('Wallet.jpg'));
  if (!link) return { noLink: true, cardText: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) };
  link.click();
  const deadline = Date.now() + 10000;
  let overlayText = '', imgSrc = null;
  while (Date.now() < deadline) {
    const ov = el.querySelector('.image-preview-overlay');
    if (ov) {
      const img = ov.querySelector('img');
      const loading = !!ov.querySelector('.loader');
      const text = ov.textContent.replace(/\s+/g, ' ').trim();
      // Спинърът значи „още се тегли"; готов отговор е или картинка, или съобщение за грешка.
      if (img && img.getAttribute('src')) { imgSrc = img.getAttribute('src'); overlayText = text; break; }
      if (!loading && text) { overlayText = text; break; }
    }
    await sleep(50);
  }
  const tok = (typeof authToken !== 'undefined' && authToken) ? authToken : null;
  return {
    noLink: false, overlayText, imgSrc,
    // Ако това е обвивката { pass, tokenData }, значи точно тя е влязла в authToken.
    tokenKeys: tok ? Object.keys(tok).sort() : null,
    tokenAccess: tok ? String(tok.access_token) : null,
    stored: (() => { try { return JSON.parse(sessionStorage.getItem('google_auth_token') || 'null'); } catch { return null; } })(),
  };
});
const reqs1 = REQS.slice(before1);

ok(!r1.noLink, `преглед: прикачената снимка се отваря от картата (${JSON.stringify(r1.cardText)})`, r1);
ok(!String(r1.overlayText).includes('Thumbnail fetch failed'),
  `преглед: в прегледа НЯМА текста "Thumbnail fetch failed" (${JSON.stringify(r1.overlayText)})`, r1);
ok(!!r1.imgSrc && r1.imgSrc === 'https://thumb.invalid/WALLET_NEW=s1600',
  `преглед: показва се самата снимка, по адреса от thumbnailLink (${r1.imgSrc})`, r1);
ok(r1.tokenAccess === 'NEW_TOKEN', `опресняване: в authToken стои tokenData, не обвивката { pass, tokenData } (${JSON.stringify(r1.tokenKeys)} :: ${r1.tokenAccess})`, r1);
ok(!!r1.stored && r1.stored.access_token === 'NEW_TOKEN',
  `опресняване: новият токен е записан и в storage (${JSON.stringify(r1.stored && r1.stored.access_token)})`, r1);

// Всяка заявка към Drive трябва да носи истински токен, не 'Bearer undefined'.
const badAuth = reqs1.filter(q => !/^Bearer [^ ]+$/.test(q.auth || '') || /undefined|null/i.test(q.auth || ''));
ok(reqs1.length > 0, `преглед: има поне една заявка към Drive (${reqs1.length})`, reqs1);
ok(badAuth.length === 0, `преглед: всяка заявка носи непразен Authorization: Bearer … (${JSON.stringify(reqs1.map(q => q.auth))})`, badAuth);
ok(reqs1.some(q => q.auth === 'Bearer NEW_TOKEN'), 'преглед: заявката след опресняването е с новия токен', reqs1.map(q => q.auth));

// ======================= 2. Провалено опресняване: казва се, че сесията е изтекла =======================
const r2 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  document.querySelectorAll('.image-preview-overlay').forEach(o => o.remove());
  // Токенът НЕ е изтекъл по issued_at, значи проверката преди заявката не вика checkAuth -
  // мери се точно пътят „401 -> опресняване -> пак 401".
  window.__auth.mode = 'error';
  authToken = { access_token: 'OLD_TOKEN', issued_at: Date.now(), expires_in: 3599 };
  const el = window.__probeEl;
  showInNotePreview(el, [{ path: 'Wallet.jpg', pathGD: 'WALLET_ERR', type: 1 }], 0, 'gdrive', false);
  const deadline = Date.now() + 10000;
  let text = '';
  while (Date.now() < deadline) {
    const ov = el.querySelector('.image-preview-overlay');
    if (ov) {
      const t = ov.textContent.replace(/\s+/g, ' ').trim();
      if (t && !ov.querySelector('.loader')) { text = t; break; }
    }
    await sleep(50);
  }
  window.__auth.mode = 'ok';
  return { text, refreshCalls: window.__auth.refreshCalls, lang: currentLang };
});
const bg = JSON.parse(await readFile(path.join(root, 'lang/i18n-bg.json'), 'utf8'));
ok(r2.text === bg.errorSessionExpired,
  `провалено опресняване: прегледът казва преведения errorSessionExpired, не английско изречение (${JSON.stringify(r2.text)})`,
  { expected: bg.errorSessionExpired, lang: r2.lang });
ok(!/Thumbnail fetch failed/i.test(String(r2.text)), 'провалено опресняване: суровият английски текст не се показва', r2);

// ======================= 3. Кешът не помни провал =======================
const r3 = await page.evaluate(async () => {
  document.querySelectorAll('.image-preview-overlay').forEach(o => o.remove());
  inlineImageThumbCache.clear();
  window.__auth.mode = 'error';                       // първият опит: 401 и провален refresh
  authToken = { access_token: 'OLD_TOKEN', issued_at: Date.now(), expires_in: 3599 };
  const first = await inlineImageThumbUrl('CACHEFILE');
  const cachedAfterFail = inlineImageThumbCache.has('CACHEFILE');
  window.__auth.mode = 'ok';                          // токенът вече се опреснява
  const second = await inlineImageThumbUrl('CACHEFILE');
  return { first, cachedAfterFail, second };
});
ok(r3.first === null, `кеш: първият опит с изтекъл токен и провален refresh връща null (${JSON.stringify(r3.first)})`, r3);
ok(r3.cachedAfterFail === false, `кеш: провалът НЕ остава в inlineImageThumbCache (${r3.cachedAfterFail})`, r3);
ok(r3.second === 'https://thumb.invalid/CACHEFILE=s400',
  `кеш: вторият опит след опресняването връща адрес, а не заковано null (${JSON.stringify(r3.second)})`, r3);

// ======================= 4. Никакви чужди грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('заявки към Drive: ' + JSON.stringify(REQS, null, 1));
  console.log('сценарий 1: ' + JSON.stringify(r1, null, 1));
  console.log('сценарий 2: ' + JSON.stringify(r2, null, 1));
  console.log('сценарий 3: ' + JSON.stringify(r3, null, 1));
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
