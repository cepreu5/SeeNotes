// Вградени картинки в бележката (text_span type=8) на main: картинката застава точно на мястото
// на маркера (звездичката) в изречението, с ширина paramint*10 % от КОЛОНАТА на бележката, а
// файлът се взима по име от папка Images в Google Drive (при две еднакви имена - най-новият).
// Точното изречение и точните офсети са от собственика (21.10); офсетите се смятат с indexOf, не
// на око. main вика Drive през gapi, затова gapi се замества в страницата (виж addInitScript).
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/type8-inline-image.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // main-овото приложение е index-2.html (то зарежда main.js); index.html е само splash.
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
// По избор: снимки за око (SHOTS=/tmp/type8), извън хранилището - проверката иначе е само числа.
const SHOTS = process.env.SHOTS || '';
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}-${name}.png` }); };
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

// --- Точното изречение от собственика, с точното място на звездичките (проверено с indexOf) ---
const SENTENCE = 'Може да добавите всяка бележка на * началния екран * като widget';
const star = (from = 0) => SENTENCE.indexOf('*', from);
const STAR1 = star();
const STAR2 = star(STAR1 + 1);
const PLAIN = SENTENCE.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

const WALLET = '/storage/emulated/0/Download/Images/Wallet.jpg';
const FILE0000 = '/storage/emulated/0/Pictures/Images/file_0000.png';
const span8 = (start, end, paramstring, paramint) => ({ start, end, type: 8, paramstring, paramint });
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');

// Кодовият блок трябва да работи и когато в бележката има вградена картинка.
const CODE_TXT = 'Проверка {{let a = 1;}} и * край';
const CODE_STAR = CODE_TXT.indexOf('*');
const CODE_PLAIN = CODE_TXT.replace('{{', '').replace('}}', '').replace('*', '').replace(/\s+/g, ' ').trim();

// Thumbnail-ите, поискани от страницата (fetch към googleapis) - за кеша.
const THUMBS = [];

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });

// gapi се замества В СТРАНИЦАТА, преди main.js да тръгне: main пита Drive през
// gapi.client.drive.files.list, а не през fetch. Фалшивата таблица държи папка Images, два файла
// с едно и също име (връщат се НАЙ-СТАРИЯТ пръв, за да се види дали редът се спазва) и един липсващ.
await ctx.addInitScript(() => {
  const F_DATA = 'FOLDER_MULTINOTES_DATA', F_IMAGES = 'FOLDER_IMAGES';
  const BY_NAME = {
    'Wallet.jpg': [
      { id: 'WALLET_OLD', name: 'Wallet.jpg', modifiedTime: '2025-01-01T00:00:00Z' },
      { id: 'WALLET_NEW', name: 'Wallet.jpg', modifiedTime: '2026-10-20T09:00:00Z' }, // най-новият
    ],
    'file_0000.png': [{ id: 'FILE0000', name: 'file_0000.png', modifiedTime: '2026-10-19T09:00:00Z' }],
    'NoSuchPhoto.jpg': [],
  };
  window.__drive = { list: [], files: BY_NAME, folders: { F_DATA, F_IMAGES } };
  window.gapi = {
    load() { },
    client: {
      setToken() { },
      getToken() { return { access_token: 'tok' }; },
      drive: {
        files: {
          list(params) {
            const p = params || {};
            window.__drive.list.push({ q: p.q || '', orderBy: p.orderBy || null, pageSize: p.pageSize || null });
            const q = p.q || '';
            // Първо заявките в папка ('<id>' in parents ...): и папка Images, и файловете по име
            // са такива. После глобалното търсене на multinotes_data - то също носи
            // mimeType='application/vnd.google-apps.folder'.
            if (/\bin parents\b/i.test(q)) {
              if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
                const fname = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
                return Promise.resolve({ result: { files: fname === 'Images' ? [{ id: F_IMAGES, name: 'Images' }] : [] } });
              }
              const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
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

await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  // 1. Метаданни за thumbnail на конкретен файл (inlineImageThumbUrl / прегледът в бележката).
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    THUMBS.push(fileId);
    if (!/^(WALLET_NEW|WALLET_OLD|FILE0000)$/.test(fileId)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s220` }) });
  }
  // 2. Самата картинка - малка, но с ясни размери, за да влезе в layout-а.
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c6d2e4"/></svg>';
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  // 3. gsi клиентът и всичко останало извън localhost - празно, за да не гърми app-ът.
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
const EMPTY_JS = ['/kb-assistant.js', '/msmrt.js'];
const page = await ctx.newPage();
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof formatText === 'function', null, { timeout: 20000 });

// --- Минималното състояние, което рендерът на main очаква (без логин и без startApp) ---
await page.evaluate(() => {
  isOfflineMode = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  contentModal = document.getElementById('content-modal');
  modalBody = document.getElementById('modal-body');
  copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
  localStorage.setItem('lang', currentLang || 'bg');
});

// --- Картите се строят през истинския createNoteElement, в собствен видим контейнер ---
const buildCards = (cards, hostWidth) => page.evaluate(async ({ cards, hostWidth }) => {
  let host = document.getElementById('inline-img-probe-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'inline-img-probe-host';
    document.body.appendChild(host);
  }
  host.style.cssText = `position:fixed;left:0;top:0;width:${hostWidth || 600}px;height:900px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;z-index:99999;background:#fff;`;
  for (const c of cards) {
    const id = 910000 + Math.floor(Math.random() * 80000);
    const nt = {
      alarm_type: -1, boardid: 'probe-board', calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
      eventId: 0, gdid: 'probe' + id, id, notetxt: c.txt, numord: id, sellist: 0, status: 0,
      text_span: c.span || '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
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
}, null, { timeout: 15000 }).then(() => 'settled').catch(() => 'timeout');

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
      text: content.textContent,
      normalized: content.textContent.replace(/\s+/g, ' ').trim(),
      contentWidth: Math.round(inner),
      contentLeft: Math.round(cr.left),
      contentRight: Math.round(cr.right),
      contentClientWidth: content.clientWidth,
      contentScrollWidth: content.scrollWidth,
      html: content.innerHTML,
      codeText: [...content.querySelectorAll('pre code')].map(c => c.textContent).join('|'),
      frames: frames.map(f => {
        const r = f.getBoundingClientRect();
        const img = f.querySelector('img');
        const prev = f.previousSibling, next = f.nextSibling;
        return {
          file: f.dataset.nmFile,
          state: f.dataset.nmState,
          inlineStyleWidth: f.style.width,
          widthPct: inner ? Math.round((r.width / inner) * 100) : null,
          overflowRight: Math.round(r.right - cr.right),
          rectLeft: Math.round(r.left),
          parentClass: f.parentElement ? (f.parentElement.className || f.parentElement.tagName) : null,
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

const spanAB = fmt(span8(STAR1, STAR1 + 1, WALLET, 4), span8(STAR2, STAR2 + 1, FILE0000, 2));
// Точно бележката на собственика (21.10): един ред, офсетите са спрямо целия текст.
const CARD_ONE = { key: 'one', txt: SENTENCE, span: spanAB };
const CARD_ONE_B = { key: 'one2', txt: SENTENCE, span: spanAB };
const CARD_M = {
  key: 'missing', txt: SENTENCE,
  span: fmt(span8(STAR1, STAR1 + 1, '/storage/emulated/0/Download/Images/NoSuchPhoto.jpg', 5), span8(STAR2, STAR2 + 1, FILE0000, 2)),
};
const CARD_CODE = { key: 'code', txt: CODE_TXT, span: fmt(span8(CODE_STAR, CODE_STAR + 1, WALLET, 3)) };

await buildCards([CARD_ONE, CARD_ONE_B, CARD_M, CARD_CODE], 600);
const settled = await waitSettled();
ok(settled !== 'timeout', 'рамките на вградените картинки излизат от "loading"');
const r = await readCards();

// ======================= 2. Бележката на собственика: картинките в изречението =======================
const one = r.one || { frames: [] };
ok(one.frames.length === 2, `бележка: две вградени картинки (${one.frames.length})`, one.frames.map(f => f.file));
ok(!String(one.text).includes('*'), 'бележка: в рендирания текст НЕ остава нито една звездичка', one.text);
ok(!String(one.title).includes('*'), `бележка: и заглавието на картата е без звездичка (${JSON.stringify(one.title)})`);
ok(one.normalized === PLAIN, `бележка: думите не се слепват и не се променят (${JSON.stringify(one.text)})`);

const f0 = one.frames[0] || {}, f1 = one.frames[1] || {};
ok(f0.file === 'Wallet.jpg' && f1.file === 'file_0000.png', `бележка: имената идват от paramstring (${f0.file}, ${f1.file})`);
ok(f0.state === 'ready' && !!f0.imgSrc && f0.imgSrc.includes('WALLET_NEW'),
  `бележка: файлът се намира по име в Images и при две еднакви имена се взима най-новият (${f0.state}, ${f0.imgSrc})`);
ok(f1.state === 'ready' && !!f1.imgSrc && f1.imgSrc.includes('FILE0000'), `бележка: втората картинка също се зарежда (${f1.state}, ${f1.imgSrc})`);
ok(f0.display === 'inline-block', `бележка: картинката е в изречението, не под него (display=${f0.display})`);
ok(String(f0.prevText).endsWith('на ') && String(f0.nextText).startsWith(' началния'),
  `бележка: картинката стои точно между думите (…${JSON.stringify(f0.prevText)} | ${JSON.stringify(f0.nextText)}…)`);
ok(String(f1.prevText).endsWith('екран ') && String(f1.nextText).startsWith(' като widget'),
  `бележка: втората картинка е на мястото на втората звездичка (…${JSON.stringify(f1.prevText)} | ${JSON.stringify(f1.nextText)}…)`);

// Ширината е процент от колоната на бележката (.note-content), не от прозореца.
ok(f0.inlineStyleWidth === '40%' && f1.inlineStyleWidth === '20%',
  `бележка: paramint 4 -> 40%, paramint 2 -> 20% (${f0.inlineStyleWidth}, ${f1.inlineStyleWidth})`);
ok(Math.abs(f0.widthPct - 40) <= 2 && Math.abs(f1.widthPct - 20) <= 2,
  `бележка: измерената ширина е процент от колоната (колона ${one.contentWidth}px, ${f0.widthPct}% и ${f1.widthPct}%)`,
  { contentWidth: one.contentWidth, w0: f0.widthPct, w1: f1.widthPct });
ok(f0.height > 0 && f1.height > 0 && f0.imgWidth > 0, `бележка: картинките имат реална височина, не 0 (${f0.height}, ${f1.height})`);
await shot('board-600');

// ======================= 3. Ред на Drive: най-новият, поискан изрично =======================
const fileCalls = await page.evaluate(() => window.__drive.list.filter(c => /in parents and name = '/.test(c.q)));
const walletCall = fileCalls.find(c => c.q.includes("name = 'Wallet.jpg'")) || {};
ok(/modifiedTime desc/.test(String(walletCall.orderBy)),
  `Drive: редът се иска изрично (orderBy=${JSON.stringify(walletCall.orderBy)})`, walletCall);
ok(fileCalls.length > 0 && fileCalls.every(c => c.q.includes('in parents')),
  'Drive: всеки файл се търси в папката Images, не по целия диск', fileCalls.slice(0, 3));

// ======================= 4. Кеш: втора карта със същите снимки не пита Drive =======================
const one2 = r.one2 || { frames: [] };
ok(one2.frames.length === 2 && one2.frames.every(f => f.state === 'ready'), 'кеш: втора карта със същите снимки също ги показва', one2.frames.map(f => f.state));
const walletQueries = fileCalls.filter(c => c.q.includes("name = 'Wallet.jpg'")).length;
const fileQueries = fileCalls.filter(c => c.q.includes("name = 'file_0000.png'")).length;
const folderQueries = await page.evaluate(() => window.__drive.list.filter(c => /mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(c.q) && c.q.includes("'Images'")).length);
const walletThumbQueries = THUMBS.filter(id => id === 'WALLET_NEW').length;
ok(walletQueries === 1, `кеш: едно търсене по име за Wallet.jpg за всички карти (${walletQueries})`);
ok(fileQueries === 1, `кеш: едно търсене по име за file_0000.png (${fileQueries})`);
ok(folderQueries <= 1, `кеш: папка Images се търси веднъж (${folderQueries})`);
ok(walletThumbQueries === 1 && THUMBS.filter(id => id === 'FILE0000').length === 1,
  `кеш: един thumbnail на файл, не по един на карта (${JSON.stringify(THUMBS)})`);

// ======================= 5. Липсващ файл: рамка с името, не нищо =======================
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

// ======================= 6. Кодов блок + вградена картинка в една бележка =======================
const cd = r.code || { frames: [] };
ok(String(cd.codeText) === 'let a = 1;', `код: кодовият блок е непокътнат (${JSON.stringify(cd.codeText)})`);
ok(cd.frames.length === 1 && cd.frames[0].state === 'ready' && String(cd.frames[0].imgSrc).includes('WALLET_NEW'),
  `код: вградената картинка се показва до кодовия блок (${cd.frames.map(f => f.state)})`);
ok(!String(cd.text).includes('*') && String(cd.normalized) === CODE_PLAIN,
  `код: текстът е същият, без звездичка (${JSON.stringify(cd.text)})`);
ok(cd.frames[0] && cd.frames[0].inlineStyleWidth === '30%' && Math.abs(cd.frames[0].widthPct - 30) <= 2,
  `код: paramint 3 -> 30% (${cd.frames[0] && cd.frames[0].inlineStyleWidth}, ${cd.frames[0] && cd.frames[0].widthPct}%)`);

// ======================= 7. paramint -> ширина, и затворен край на диапазона =======================
const synth = await page.evaluate(([base, wallet]) => {
  const probe = (paramint) => {
    const o = JSON.parse(base);
    if (paramint === null) delete o.paramint; else o.paramint = paramint;
    const div = document.createElement('div');
    div.innerHTML = formatText('а * б', JSON.stringify(o), false);
    const el = div.querySelector('.nm-inline-img');
    return el ? el.style.width : null;
  };
  const closed = document.createElement('div');
  closed.innerHTML = formatText('а * б', JSON.stringify({ start: 2, end: 4, type: 8, paramstring: wallet, paramint: 10 }), false);
  const cEl = closed.querySelector('.nm-inline-img');
  return {
    one: probe(1), ten: probe(10), none: probe(null), zero: probe(0),
    closedFrames: closed.querySelectorAll('.nm-inline-img').length,
    closedText: closed.textContent,
    closedWidth: cEl ? cEl.style.width : null,
  };
}, [JSON.stringify(span8(2, 3, WALLET, 4)), WALLET]);
ok(synth.one === '10%' && synth.ten === '100%', `paramint 1 -> 10%, 10 -> 100% (${synth.one}, ${synth.ten})`);
ok(synth.none === '100%' && synth.zero === '100%', `липсващ/нулев paramint -> 100% (${synth.none}, ${synth.zero})`);
// Диапазонът покрива звездичката и интервала след нея: пак една картинка и никаква звездичка.
ok(synth.closedFrames === 1 && !synth.closedText.includes('*') && synth.closedText.replace(/\s+/g, ' ').trim() === 'а б',
  `затворен край [2,4): пак една картинка и никаква звездичка (${synth.closedFrames}, ${JSON.stringify(synth.closedText)})`);

// ======================= 8. Нищо друго във форматирането не се променя (type 1-7) =======================
const reg = await page.evaluate(() => {
  const F = (text, spans) => formatText(text, spans.length ? spans.join('|') : null, false);
  return {
    esc: F('<b>x</b> & y', []),
    bold: F('abc', [JSON.stringify({ start: 0, end: 3, type: 1 })]),
    boldItalic: F('abc', [JSON.stringify({ start: 0, end: 3, type: 1 }), JSON.stringify({ start: 0, end: 3, type: 2 })]),
    strike: F('abc', [JSON.stringify({ start: 0, end: 3, type: 7 })]),
    color: F('abc', [JSON.stringify({ start: 0, end: 3, type: 4, paramint: -65536 })]),
    size: F('abc', [JSON.stringify({ start: 0, end: 3, type: 6, paramfloat: 1.5 })]),
    code: F('код {{let a = 1;}}', []),
    nl: F('а\nб', []),
  };
});
ok(reg.esc === '&lt;b&gt;x&lt;/b&gt; &amp; y', `регресия: екранирането е същото (${JSON.stringify(reg.esc)})`);
ok(reg.bold === '<strong>abc</strong>', `регресия: type=1 bold (${JSON.stringify(reg.bold)})`);
ok(reg.boldItalic === '<strong><em>abc</em></strong>', `регресия: type=1+2, същият ред на обвиване (${JSON.stringify(reg.boldItalic)})`);
ok(reg.strike === '<s>abc</s>', `регресия: type=7 задраскване (${JSON.stringify(reg.strike)})`);
ok(reg.color === '<span style="color: rgba(255, 0, 0, 1);">abc</span>', `регресия: type=4 цвят (${JSON.stringify(reg.color)})`);
ok(reg.size === '<span style="font-size: 150%;">abc</span>', `регресия: type=6 размер (${JSON.stringify(reg.size)})`);
ok(reg.nl === 'а<br>б', `регресия: нов ред е <br> (${JSON.stringify(reg.nl)})`);
ok(/<pre><code>let a = 1;<\/code><\/pre>/.test(reg.code) && reg.code.includes('код'), `регресия: кодовият блок остава в текста (${JSON.stringify(reg.code)})`);

// ======================= 9. Модалът: същият запис, по-широка колона =======================
await page.evaluate(([raw, format]) => showModal({ raw, format, id: 'type8-modal' }), [SENTENCE, spanAB]);
const modalSettled = await page.waitForFunction(() => {
  const boxes = [...document.querySelectorAll('#modal-body .nm-inline-img')];
  return boxes.length === 2 && boxes.every(b => b.dataset.nmState !== 'loading');
}, null, { timeout: 15000 }).then(() => true).catch(() => false);
// Модалът се отваря с преход: измерването се прави, след като мащабът му се установи - иначе
// getBoundingClientRect връща смалени размери и процентът изглежда грешен.
const modalGeometry = await page.waitForFunction(() => {
  const body = document.getElementById('modal-body');
  if (!body || !body.offsetWidth) return false;
  const scale = body.getBoundingClientRect().width / body.offsetWidth;
  if (Math.abs(scale - 1) > 0.01) return false;
  const w = body.getBoundingClientRect().width;
  const prev = window.__modalStableW;
  window.__modalStableW = w;
  return prev !== undefined && Math.abs(prev - w) < 0.5;
}, null, { timeout: 15000 }).then(() => true).catch(() => false);
ok(modalSettled && modalGeometry, 'модал: двете вградени картинки се зареждат и в модала');
const modal = await page.evaluate(() => {
  const body = document.getElementById('modal-body');
  if (!body) return { missing: true };
  const cs = getComputedStyle(body);
  const inner = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  return {
    text: body.textContent,
    normalized: body.textContent.replace(/\s+/g, ' ').trim(),
    innerWidth: Math.round(inner),
    frames: [...body.querySelectorAll('.nm-inline-img')].map(f => ({
      state: f.dataset.nmState,
      style: f.style.width,
      pct: inner ? Math.round((f.getBoundingClientRect().width / inner) * 100) : null,
      imgSrc: f.querySelector('img') ? f.querySelector('img').getAttribute('src') : null,
    })),
  };
});
ok(!modal.missing && modal.frames.length === 2, `модал: две картинки (${modal.frames && modal.frames.length})`);
ok(!String(modal.text).includes('*'), 'модал: никаква звездичка в текста', modal.text);
ok(modal.normalized === PLAIN, `модал: тялото е същото, думите разделени (${JSON.stringify(modal.text)})`);
ok(modal.frames[0] && modal.frames[1] && Math.abs(modal.frames[0].pct - 40) <= 2 && Math.abs(modal.frames[1].pct - 20) <= 2,
  `модал: процентът е от колоната на модала, значи картинката расте с прозореца (колона ${modal.innerWidth}px, ${modal.frames[0] && modal.frames[0].pct}%, ${modal.frames[1] && modal.frames[1].pct}%)`,
  modal.frames);
await shot('modal-1280');
ok(modal.frames[0] && modal.frames[0].state === 'ready' && !!modal.frames[0].imgSrc,
  `модал: картинката е заредена (${modal.frames[0] && modal.frames[0].state}, ${modal.frames[0] && modal.frames[0].imgSrc})`);

// ======================= 10. Клик отваря съществуващия преглед на бележката =======================
const overlay = await page.evaluate(async () => {
  const card = document.querySelector('#inline-img-probe-host .note[data-probe="one"]');
  const box = card && card.querySelector('.nm-inline-img.is-ready');
  if (!box) return { missing: true };
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  box.click();
  const deadline = Date.now() + 8000;
  let src = null;
  while (Date.now() < deadline) {
    const img = card.querySelector('.image-preview-overlay img');
    if (img && img.getAttribute('src')) { src = img.getAttribute('src'); break; }
    await new Promise(r => setTimeout(r, 50));
  }
  const ov = card.querySelector('.image-preview-overlay');
  const out = { has: !!ov, src };
  if (ov) ov.remove();
  return out;
});
ok(!overlay.missing && overlay.has, 'клик: отваря се съществуващият overlay за преглед (showInNotePreview)', overlay);
ok(!overlay.missing && !!overlay.src && String(overlay.src).includes('WALLET_NEW'),
  `клик: прегледът показва същия файл (${overlay.src})`, overlay);

// ======================= 11. Тясна колона (карта на борда на телефон) =======================
await page.setViewportSize({ width: 390, height: 800 });
await clearCards();
await buildCards([CARD_ONE], 240);
const narrowSettled = await waitSettled();
const nr = await readCards();
const np = nr.one || { frames: [] };
ok(narrowSettled !== 'timeout' && np.frames.length === 2 && np.frames.every(f => f.state === 'ready'),
  `тясна колона: двете картинки се показват (${np.frames.map(f => f.state)})`);
ok(np.contentWidth < 240 && np.contentWidth > 150,
  `тясна колона: колоната е наистина тясна (${np.contentWidth}px)`);
ok(np.frames[0] && np.frames[1] && Math.abs(np.frames[0].widthPct - 40) <= 3 && Math.abs(np.frames[1].widthPct - 20) <= 3,
  `тясна колона: пак 40% и 20% от колоната, значи картинката се свива с картата (${np.frames[0] && np.frames[0].widthPct}%, ${np.frames[1] && np.frames[1].widthPct}%)`,
  np.frames.map(f => ({ w: f.widthPct, style: f.inlineStyleWidth })));
ok(np.frames.every(f => f.overflowRight <= 0), 'тясна колона: нито една картинка не излиза извън колоната',
  { col: [np.contentLeft, np.contentRight, np.contentClientWidth, np.contentScrollWidth], frames: np.frames.map(f => ({ o: f.overflowRight, l: f.rectLeft, p: f.parentClass, w: f.widthPct })) });
ok(!String(np.text).includes('*') && String(np.normalized) === PLAIN, 'тясна колона: текстът е същият и без звездички', np.text);
await shot('narrow-390');
await clearCards();

// ======================= 12. Никакви грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('Drive заявки: ' + JSON.stringify(await page.evaluate(() => window.__drive.list.slice(0, 10))));
  console.log('thumbnail заявки: ' + JSON.stringify(THUMBS));
  console.log('карта "one": ' + JSON.stringify({ text: one.text, html: one.html && one.html.slice(0, 600), frames: one.frames }, null, 1));
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
