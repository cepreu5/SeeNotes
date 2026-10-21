// Вградени картинки в бележката (text_span type=8): картинката застава точно на мястото на
// маркера (звездичката) в изречението, с ширина paramint*10 % от КОЛОНАТА на бележката, а файлът
// се взима по име от папка Images в Google Drive (при две еднакви имена - най-новият).
// Точното изречение и точните офсети са от собственика (21.10); офсетите се проверяват с node,
// не на око. Пуска се от корена на хранилището:
//   node .bolter/check/type8-inline-image.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? 'index.html' : p;
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

// --- Точното изречение от собственика, с точното място на звездичките (проверено с node) ---
const SENTENCE = 'Може да добавите всяка бележка на * началния екран * като widget';
const STAR1 = SENTENCE.indexOf('*');
const STAR2 = SENTENCE.indexOf('*', STAR1 + 1);
const PLAIN = SENTENCE.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

const WALLET = '/storage/emulated/0/Download/Images/Wallet.jpg';
const FILE0000 = '/storage/emulated/0/Pictures/Images/file_0000.png';
const span8 = (start, end, paramstring, paramint) => ({ start, end, type: 8, paramstring, paramint });
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');

// --- Фалшив Google Drive: папка Images, два файла с едно и също име, един липсващ ---
const DRIVE = {
  list: [], // { q, space } - всяка заявка за файлове, за да се види кешът
  thumb: [], // fileId-та, за които е питано за thumbnailLink
};
const FOLDER_IMAGES = 'FOLDER_IMAGES';
const BY_NAME = {
  'Wallet.jpg': [
    { id: 'WALLET_NEW', name: 'Wallet.jpg', modifiedTime: '2026-10-20T09:00:00Z' }, // най-новият
    { id: 'WALLET_OLD', name: 'Wallet.jpg', modifiedTime: '2025-01-01T00:00:00Z' },
  ],
  'file_0000.png': [{ id: 'FILE0000', name: 'file_0000.png', modifiedTime: '2026-10-19T09:00:00Z' }],
  'NoSuchPhoto.jpg': [],
};
const THUMB = { WALLET_NEW: 's220', WALLET_OLD: 's220', FILE0000: 's220' };

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
ctx.on('page', p => p.on('pageerror', () => {}));
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  // 1. Метаданни за thumbnail на конкретен файл (inlineImageThumbUrl / прегледът в бележката).
  //    ПРОВЕРЯВА СЕ ПРЕДИ списъка: този адрес също започва с /drive/v3/files.
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    DRIVE.thumb.push(fileId);
    if (!THUMB[fileId]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=${THUMB[fileId]}` }) });
  }
  // 2. Папки и файлове в Drive (getFolderIDByName / findGDFileByName).
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const u = new URL(url);
    const q = u.searchParams.get('q') || '';
    DRIVE.list.push(q);
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: name === 'Images' ? [{ id: FOLDER_IMAGES, name: 'Images' }] : [] }) });
    }
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    const files = BY_NAME[name] || [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
  }
  // 3. Самата картинка - малка, но с ясни размери, за да влезе в layout-а.
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c6d2e4"/></svg>';
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  // 4. Всичко останало (gsi клиентът и т.н.) - празно, за да не гърми app-ът.
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.addInitScript(() => {
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });

// --- Картите се строят през истинския createNoteElement, в собствен видим контейнер ---
// (#notes-container е с височина 0 и картите в него не се подреждат - геометрията би била 0x0.)
const buildCards = (cards, hostWidth) => page.evaluate(async ({ cards, hostWidth }) => {
  isOffline = false; // иначе getFolderIDByName/findGDFileByName отказват да питат Drive
  let host = document.getElementById('inline-img-probe-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'inline-img-probe-host';
    document.body.appendChild(host);
  }
  host.style.cssText = `position:fixed;left:0;top:0;width:${hostWidth || 600}px;height:900px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;z-index:99999;background:#fff;`;
  const board = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  for (const c of cards) {
    const id = 910000 + Math.floor(Math.random() * 80000);
    const nt = {
      alarm_type: -1, boardid: board.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
      eventId: 0, gdid: 'probe' + id, id, notetxt: c.txt, numord: id, sellist: 0, status: 0,
      text_span: c.span || '', title_span: c.titleSpan || '', timer: 0, timer_type: -1, timer_val: 1, type: c.type || 0, version: 244,
    };
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    el.dataset.probe = c.key;
    el.style.display = 'flex';
    el.style.contentVisibility = 'visible';
    host.appendChild(el);
  }
  return true;
}, { cards, hostWidth });

const waitSettled = () => page.waitForFunction(() => {
  const boxes = [...document.querySelectorAll('#inline-img-probe-host .nm-inline-img')];
  return boxes.length > 0 && boxes.every(b => b.dataset.nmState !== 'loading');
}, null, { timeout: 15000 }).catch(() => 'timeout');

const readCards = () => page.evaluate(() => {
  const out = {};
  for (const card of document.querySelectorAll('#inline-img-probe-host .note')) {
    const content = card.querySelector('.note-content');
    const h3 = card.querySelector('h3');
    const cr = content.getBoundingClientRect();
    // Процентната ширина се смята спрямо съдържащата кутия (content box), не спрямо border box-а.
    const cs = getComputedStyle(content);
    const inner = content.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const frames = [...content.querySelectorAll('.nm-inline-img')];
    out[card.dataset.probe] = {
      title: h3 ? h3.textContent.trim() : null,
      offline: typeof isOffline !== 'undefined' ? isOffline : 'undefined',
      text: content.textContent,
      normalized: content.textContent.replace(/\s+/g, ' ').trim(),
      contentWidth: Math.round(inner),
      contentLeft: Math.round(cr.left),
      contentRight: Math.round(cr.right),
      contentClientWidth: content.clientWidth,
      contentScrollWidth: content.scrollWidth,
      html: content.innerHTML,
      frames: frames.map(f => {
        const r = f.getBoundingClientRect();
        const img = f.querySelector('img');
        const prev = f.previousSibling, next = f.nextSibling;
        return {
          file: f.dataset.nmFile,
          state: f.dataset.nmState,
          inlineStyleWidth: f.style.width,
          widthPct: inner ? Math.round((r.width / inner) * 100) : null,
          // Колко излиза вдясно от колоната на бележката (положително = извън нея).
          overflowRight: Math.round(r.right - cr.right),
          rectLeft: Math.round(r.left),
          offsetLeft: f.offsetLeft,
          parentClass: f.parentElement ? (f.parentElement.className || f.parentElement.tagName) : null,
          parentRight: f.parentElement ? Math.round(f.parentElement.getBoundingClientRect().right) : null,
          height: Math.round(r.height),
          display: getComputedStyle(f).display,
          imgSrc: img ? img.getAttribute('src') : null,
          imgWidth: img ? Math.round(img.getBoundingClientRect().width) : 0,
          prevText: prev && prev.nodeType === 3 ? prev.textContent.slice(-14) : null,
          nextText: next && next.nodeType === 3 ? next.textContent.slice(0, 14) : null,
          label: f.textContent,
        };
      }),
    };
  }
  return out;
});

const clearCards = () => page.evaluate(() => {
  const host = document.getElementById('inline-img-probe-host');
  if (host) host.remove();
});

// ======================= 1. Точните офсети от собственика =======================
ok(SENTENCE.length === 64, `изречението е 64 знака (${SENTENCE.length})`);
ok(STAR1 === 34 && STAR2 === 51, `звездичките са на 34 и 51 (${STAR1}, ${STAR2})`);

const PIPE_TITLE = 'Бележка';
const spanAB = fmt(span8(STAR1, STAR1 + 1, WALLET, 4), span8(STAR2, STAR2 + 1, FILE0000, 2));
const CARD_P = { key: 'pipe', txt: PIPE_TITLE + '|' + SENTENCE, span: spanAB };
const CARD_P2 = { key: 'pipe2', txt: PIPE_TITLE + '|' + SENTENCE, span: spanAB };
const CARD_M = { key: 'missing', txt: 'Липсваща|' + SENTENCE, span: fmt(span8(STAR1, STAR1 + 1, '/storage/emulated/0/Download/Images/NoSuchPhoto.jpg', 5), span8(STAR2, STAR2 + 1, FILE0000, 2)) };
const TITLE_N = 'Заглавие';
const OFF_N = TITLE_N.length + 1; // без '|' форматите са спрямо целия текст, офсетът на заглавието се изважда
const CARD_N = { key: 'plain', txt: TITLE_N + '\n' + SENTENCE, span: fmt(span8(STAR1 + OFF_N, STAR1 + 1 + OFF_N, WALLET, 4), span8(STAR2 + OFF_N, STAR2 + 1 + OFF_N, FILE0000, 2)) };
// Точно бележката на собственика (21.10): един ред, завършва с \n, офсетите са спрямо целия текст.
const CARD_ONE = { key: 'one', txt: SENTENCE + '\n', span: fmt(span8(STAR1, STAR1 + 1, WALLET, 4), span8(STAR2, STAR2 + 1, FILE0000, 2)) };

await buildCards([CARD_P, CARD_P2, CARD_M, CARD_N], 600);
const settled = await waitSettled();
ok(settled !== 'timeout', 'рамките на вградените картинки излизат от "loading"');
const r = await readCards();

// ======================= 2. Борд, бележка със '|' =======================
const p = r.pipe || { frames: [] };
ok(p.frames.length === 2, `борд: две вградени картинки (${p.frames.length})`, p.frames.map(f => f.file));
ok(!String(p.text).includes('*'), 'борд: в рендирания текст НЕ остава нито една звездичка', p.text);
ok(p.normalized === PLAIN, `борд: думите не се слепват и не се променят (${JSON.stringify(p.text)})`);
ok(p.title === PIPE_TITLE, `борд: заглавието пред '|' е отделно (${p.title})`);

const f0 = p.frames[0] || {}, f1 = p.frames[1] || {};
ok(f0.file === 'Wallet.jpg' && f1.file === 'file_0000.png', `борд: имената идват от paramstring (${f0.file}, ${f1.file})`);
ok(f0.state === 'ready' && !!f0.imgSrc && f0.imgSrc.includes('WALLET_NEW'),
  `борд: файлът се намира по име в Images и при две еднакви имена се взима най-новият (${f0.state}, ${f0.imgSrc})`);
ok(f1.state === 'ready' && !!f1.imgSrc && f1.imgSrc.includes('FILE0000'), `борд: втората картинка също се зарежда (${f1.state}, ${f1.imgSrc})`);
ok(f0.display === 'inline-block', `борд: картинката е в изречението, не под него (display=${f0.display})`);
ok(String(f0.prevText).endsWith('на ') && String(f0.nextText).startsWith(' началния'),
  `борд: картинката стои точно между думите (…${JSON.stringify(f0.prevText)} | ${JSON.stringify(f0.nextText)}…)`);
ok(String(f1.prevText).endsWith('екран ') && String(f1.nextText).startsWith(' като widget'),
  `борд: втората картинка е на мястото на втората звездичка (…${JSON.stringify(f1.prevText)} | ${JSON.stringify(f1.nextText)}…)`);

// Ширината е процент от колоната на бележката (.note-content), не от прозореца.
ok(f0.inlineStyleWidth === '40%' && f1.inlineStyleWidth === '20%',
  `борд: paramint 4 -> 40%, paramint 2 -> 20% (${f0.inlineStyleWidth}, ${f1.inlineStyleWidth})`);
ok(Math.abs(f0.widthPct - 40) <= 2 && Math.abs(f1.widthPct - 20) <= 2,
  `борд: измерената ширина е процент от колоната (колона ${p.contentWidth}px, ${f0.widthPct}% и ${f1.widthPct}%)`);
ok(f0.height > 0 && f1.height > 0 && f0.imgWidth > 0, `борд: картинките имат реална височина, не 0 (${f0.height}, ${f1.height})`);

// ======================= 3. Кеш: втора карта със същата снимка не пита Drive =======================
const p2 = r.pipe2 || { frames: [] };
ok(p2.frames.length === 2 && p2.frames.every(f => f.state === 'ready'), 'борд: втора карта със същите снимки също ги показва', p2.frames.map(f => f.state));
const walletQueries = DRIVE.list.filter(q => q.includes("name = 'Wallet.jpg'")).length;
const fileQueries = DRIVE.list.filter(q => q.includes("name = 'file_0000.png'")).length;
const folderQueries = DRIVE.list.filter(q => /mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q) && q.includes("'Images'")).length;
const walletThumbQueries = DRIVE.thumb.filter(id => id === 'WALLET_NEW').length;
ok(walletQueries === 1, `кеш: едно търсене по име за Wallet.jpg за всички карти (${walletQueries})`);
ok(fileQueries === 1, `кеш: едно търсене по име за file_0000.png (${fileQueries})`);
ok(folderQueries <= 1, `кеш: папка Images се търси веднъж (${folderQueries})`);
ok(walletThumbQueries === 1, `кеш: един thumbnail на файл, не по един на карта (${walletThumbQueries})`);

// ======================= 4. Липсващ файл: рамка с името, не нищо =======================
const m = r.missing || { frames: [] };
ok(m.frames.length === 2, `липсващ файл: две рамки - една липсваща и една заредена (${m.frames.length})`, m.frames.map(f => [f.file, f.state]));
const mf = m.frames[0] || {};
ok(mf.state === 'missing', `липсващ файл: състоянието е "missing" (${mf.state})`);
ok(!mf.imgSrc, 'липсващ файл: няма счупена картинка, само рамка');
ok(String(mf.label).includes('NoSuchPhoto.jpg'), `липсващ файл: рамката казва името (${mf.label})`);
// Причината се показва на езика на приложението (bg/en), затова се търси смисълът, не точният низ.
ok(String(mf.label).replace('NoSuchPhoto.jpg', '').trim().length > 0 && /Images/i.test(String(mf.label)),
  `липсващ файл: рамката казва и защо (${mf.label})`);
ok(mf.inlineStyleWidth === '50%' && Math.abs(mf.widthPct - 50) <= 2,
  `липсващ файл: paramint 5 -> 50% (${mf.inlineStyleWidth}, ${mf.widthPct}%)`);
ok(m.frames[1] && m.frames[1].state === 'ready' && String(m.frames[1].imgSrc).includes('FILE0000'),
  `липсващ файл: втората картинка в същата бележка не пострадва (${m.frames[1] && m.frames[1].state})`);
ok(!String(m.text).includes('*') && String(m.text).includes('началния екран') && String(m.text).includes('като widget'),
  'липсващ файл: останалият текст е непокътнат и без звездички', m.text);

// ======================= 5. Без '|': офсетите се изместват с дължината на заглавието =======================
const nn = r.plain || { frames: [] };
ok(nn.title === TITLE_N, `без '|': първият ред е заглавие (${nn.title})`);
ok(nn.frames.length === 2 && nn.frames.every(f => f.state === 'ready'), `без '|': двете картинки се показват в тялото (${nn.frames.map(f => f.state)})`);
ok(nn.normalized === PLAIN, `без '|': думите остават разделени (${JSON.stringify(nn.text)})`);
ok(nn.frames[0] && nn.frames[0].inlineStyleWidth === '40%' && nn.frames[1] && nn.frames[1].inlineStyleWidth === '20%',
  `без '|': ширините са същите (${nn.frames[0] && nn.frames[0].inlineStyleWidth}, ${nn.frames[1] && nn.frames[1].inlineStyleWidth})`);

// ======================= 6. Маркерът се маха и когато диапазонът е със затворен край =======================
const closed = await page.evaluate((span) => {
  const div = document.createElement('div');
  div.innerHTML = getFormattedNoteHtml('а * б', span, '', false);
  return { html: div.innerHTML, text: div.textContent, frames: div.querySelectorAll('.nm-inline-img').length, width: (div.querySelector('.nm-inline-img') || {}).style ? div.querySelector('.nm-inline-img').style.width : null };
}, fmt(span8(2, 4, WALLET, 10)));
ok(closed.frames === 1 && !closed.text.includes('*') && closed.text.replace(/\s+/g, ' ').trim() === 'а б',
  `затворен край [2,4): пак една картинка и никаква звездичка (${closed.frames}, ${JSON.stringify(closed.text)})`);

// ======================= 7. paramint -> ширина: 1 = 10%, 10 = 100%, липсващ = 100% =======================
const widths = await page.evaluate(([base, w]) => {
  const probe = (paramint) => {
    const o = JSON.parse(base);
    if (paramint === null) delete o.paramint; else o.paramint = paramint;
    const div = document.createElement('div');
    div.innerHTML = getFormattedNoteHtml('а * б', JSON.stringify(o), '', false);
    const el = div.querySelector('.nm-inline-img');
    return el ? el.style.width : null;
  };
  return { one: probe(1), ten: probe(10), none: probe(null), zero: probe(0) };
}, [JSON.stringify(span8(2, 3, WALLET, 4)), null]);
ok(widths.one === '10%' && widths.ten === '100%', `paramint 1 -> 10%, 10 -> 100% (${widths.one}, ${widths.ten})`);
ok(widths.none === '100%' && widths.zero === '100%', `липсващ/нулев paramint -> 100% (${widths.none}, ${widths.zero})`);

// ======================= 8. Модалът: същият запис, по-широка колона =======================
await page.evaluate(([raw, format]) => showModal({ raw, format, id: 'type8-modal' }), [PIPE_TITLE + '|' + SENTENCE, spanAB]);
const modalSettled = await page.waitForFunction(() => {
  const boxes = [...document.querySelectorAll('#modal-body .nm-inline-img')];
  return boxes.length === 2 && boxes.every(b => b.dataset.nmState !== 'loading');
}, null, { timeout: 15000 }).then(() => true).catch(() => false);
// Модалът се отваря с преход - измерването се прави след като ширината му се установи.
await page.evaluate(() => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 300)));
ok(modalSettled, 'модал: двете вградени картинки се зареждат и в модала');
const modal = await page.evaluate(() => {
  const body = document.getElementById('modal-body');
  if (!body) return { missing: true };
  const cs = getComputedStyle(body);
  const inner = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const frames = [...body.querySelectorAll('.nm-inline-img')];
  return {
    text: body.textContent,
    normalized: body.textContent.replace(/\s+/g, ' ').trim(),
    innerWidth: Math.round(inner),
    frames: frames.map(f => ({
      state: f.dataset.nmState,
      style: f.style.width,
      pct: inner ? Math.round((f.getBoundingClientRect().width / inner) * 100) : null,
      parent: f.parentElement ? (f.parentElement.id || f.parentElement.className) : null,
      parentWidth: f.parentElement ? Math.round(f.parentElement.getBoundingClientRect().width) : null,
      imgSrc: f.querySelector('img') ? f.querySelector('img').getAttribute('src') : null,
    })),
  };
});
ok(!modal.missing && modal.frames.length === 2, `модал: две картинки (${modal.frames && modal.frames.length})`);
ok(!String(modal.text).includes('*'), 'модал: никаква звездичка в текста', modal.text);
ok(modal.normalized.endsWith(PLAIN), `модал: тялото е същото, думите разделени (${JSON.stringify(modal.text)})`);
ok(modal.frames[0] && modal.frames[1] && Math.abs(modal.frames[0].pct - 40) <= 2 && Math.abs(modal.frames[1].pct - 20) <= 2,
  `модал: процентът е от колоната на модала, значи картинката расте с прозореца (колона ${modal.innerWidth}px, ${modal.frames[0] && modal.frames[0].pct}%, ${modal.frames[1] && modal.frames[1].pct}%)`,
  modal.frames.map(f => ({ pct: f.pct, style: f.style, parent: f.parent, parentWidth: f.parentWidth })));
ok(modal.frames[0] && modal.frames[0].state === 'ready' && !!modal.frames[0].imgSrc,
  `модал: картинката е заредена (${modal.frames[0] && modal.frames[0].state}, ${modal.frames[0] && modal.frames[0].imgSrc})`);

// ======================= 9. Клик отваря съществуващия преглед на бележката =======================
const overlay = await page.evaluate(async () => {
  const card = document.querySelector('#inline-img-probe-host .note[data-probe="pipe"]');
  const box = card && card.querySelector('.nm-inline-img.is-ready');
  if (!box) return { missing: true };
  if (typeof authToken !== 'undefined') authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  // В проверката няма истински Google клиент (скриптът му е заместител, само за да не гърми app-ът),
  // затова прегледът получава минимален gapi - иначе спира преди да поиска картинката.
  if (typeof gapi === 'undefined') {
    window.gapi = { client: { getToken: () => ({ access_token: 'tok' }), setToken() {} }, auth: { getToken: () => ({ access_token: 'tok' }) } };
  }
  box.click();
  const deadline = Date.now() + 8000;
  let src = null;
  while (Date.now() < deadline) {
    const img = card.querySelector('.image-preview-overlay img');
    if (img && img.getAttribute('src')) { src = img.getAttribute('src'); break; }
    await new Promise(r => setTimeout(r, 50));
  }
  const has = !!card.querySelector('.image-preview-overlay');
  const ov = card.querySelector('.image-preview-overlay');
  const out = { has, src, hasImg: !!card.querySelector('.image-preview-overlay img'), text: ov ? ov.textContent.slice(0, 200) : null };
  if (ov) ov.remove();
  return out;
});
ok(!overlay.missing && overlay.has, 'клик: отваря се съществуващият overlay за преглед (showInNotePreview)', overlay);
ok(!overlay.missing && !!overlay.src && String(overlay.src).includes('WALLET_NEW'),
  `клик: прегледът показва същия файл (${overlay.src})`, overlay);

// ======================= 9б. Точно бележката на собственика: един ред без '|' =======================
// На борда първият ред се показва като заглавие и се срязва на граница на дума; остатъкът става
// тяло и се пре-рендира (ResizeObserver в createNoteElement), затова картинките излизат и тук.
await buildCards([CARD_ONE], 600);
await waitSettled();
// Изчаква се пре-рендирането след срязването на заглавието да е приключило (двете рамки готови).
const oneReady = await page.waitForFunction(() => {
  const card = document.querySelector('#inline-img-probe-host .note[data-probe="one"]');
  if (!card) return false;
  const boxes = [...card.querySelectorAll('.nm-inline-img')];
  return boxes.length === 2 && boxes.every(b => b.dataset.nmState === 'ready');
}, null, { timeout: 15000 }).then(() => true).catch(() => false);
await page.evaluate(() => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 400)));
const one = (await readCards()).one || { frames: [] };
ok(oneReady, `един ред: двете картинки влизат в пре-рендираното тяло (${one.frames.map(f => f.state)})`);
ok(one.frames.length === 2 && one.frames.every(f => f.state === 'ready' && !!f.imgSrc),
  `един ред: картинките се зареждат и на картата (${one.frames.map(f => f.state)})`);
ok(!String(one.title).includes('*') && !String(one.text).includes('*'),
  `един ред: нито в заглавието, нито в тялото остава звездичка (${JSON.stringify(one.title)} | ${JSON.stringify(one.text)})`);
ok(`${one.title} ${one.text}`.replace(/\s+/g, ' ').trim() === PLAIN,
  `един ред: заглавие + тяло дават точно изречението, думите разделени (${JSON.stringify(one.title + ' ' + one.text)})`);
ok(one.frames[0] && one.frames[1] && Math.abs(one.frames[0].widthPct - 40) <= 3 && Math.abs(one.frames[1].widthPct - 20) <= 3,
  `един ред: ширините пак са от колоната (${one.frames[0] && one.frames[0].widthPct}%, ${one.frames[1] && one.frames[1].widthPct}%)`);

// ======================= 10. Тясна колона (карта на борда на телефон) =======================
await page.setViewportSize({ width: 390, height: 800 });
await clearCards();
await buildCards([CARD_P], 240);
const narrowSettled = await waitSettled();
const nr = await readCards();
const np = nr.pipe || { frames: [] };
ok(narrowSettled !== 'timeout' && np.frames.length === 2 && np.frames.every(f => f.state === 'ready'),
  `тясна колона: двете картинки се показват (${np.frames.map(f => f.state)})`);
ok(np.contentWidth < 240 && np.frames.length === 2,
  `тясна колона: колоната е наистина тясна (${np.contentWidth}px)`);
ok(np.frames[0] && np.frames[1] && Math.abs(np.frames[0].widthPct - 40) <= 3 && Math.abs(np.frames[1].widthPct - 20) <= 3,
  `тясна колона: пак 40% и 20% от колоната, значи картинката се свива с картата (${np.frames[0] && np.frames[0].widthPct}%, ${np.frames[1] && np.frames[1].widthPct}%)`,
  np.frames.map(f => ({ w: f.widthPct, style: f.inlineStyleWidth })));
ok(np.frames.every(f => f.overflowRight <= 0), 'тясна колона: нито една картинка не излиза извън колоната',
  { col: [np.contentLeft, np.contentRight, np.contentClientWidth, np.contentScrollWidth], frames: np.frames.map(f => ({ o: f.overflowRight, l: f.rectLeft, ol: f.offsetLeft, p: f.parentClass, pr: f.parentRight, w: f.widthPct })), cardHtml: np.html });
ok(!String(np.text).includes('*') && String(np.normalized) === PLAIN, 'тясна колона: текстът е същият и без звездички', np.text);
await clearCards();

// ======================= 11. Никакви грешки =======================
await clearCards();
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  // За да не се гадае при провал: какво е питало приложението и какво е отговорил Drive.
  console.log('isOffline в страницата: ' + JSON.stringify(r.pipe && r.pipe.offline));
  console.log('Drive заявки: ' + JSON.stringify(DRIVE.list.slice(0, 10)));
  console.log('thumbnail заявки: ' + JSON.stringify(DRIVE.thumb));
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
