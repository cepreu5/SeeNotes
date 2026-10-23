// Заглавието на картата, когато бележката има вградена снимка (type=8) - план 10, cx-notes.
// Собственикът (23.10.2026): „ред със снимка не става заглавие, картата показва снимката в тялото.
// Заглавие се взима само от ред без вграден маркер, а бележка само със снимка остава без заглавие."
// Проверява се по истинския път на картата (createNoteElement), не по пресметнато правило:
//   - бележка само със снимка: заглавие НЯМА (нито „...", нито знака на маркера) и е скрито,
//     а снимката стои в тялото на картата;
//   - първи ред снимка, втори ред дума: заглавието е думата от втория ред, а снимката пак е в тялото;
//   - текст и снимка на ЕДИН ред: този ред не става заглавие - картата показва снимката в тялото;
//   - празна бележка без снимки пази днешното „...";
//   - редът с датата и часа си остава както е.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/inline-image-card-title.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
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
const SHOTS = process.env.SHOTS || '';

// --- Фалшив Drive: папка Images с една малка снимка (300px) ---
const DRIVE = { list: [], thumb: [] };
const FOLDER_IMAGES = 'FOLDER_IMAGES';
const DATA_FOLDER = 'FOLDER_MULTINOTES_DATA';
const SMALL = 'file_0000.png';
const SMALL_ID = 'FILE0000';
const WIDE = 300;

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    DRIVE.thumb.push(fileId);
    if (fileId !== SMALL_ID) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s800` }) });
  }
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const u = new URL(url);
    const q = u.searchParams.get('q') || '';
    DRIVE.list.push(q);
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      if (name === 'Images') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: FOLDER_IMAGES, name: 'Images' }] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
    }
    if (name === 'multinotes_data') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: DATA_FOLDER, name: 'multinotes_data' }] }) });
    if (name === SMALL) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: SMALL_ID, name: SMALL, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDE}" height="225"><rect width="${WIDE}" height="225" fill="#c6d2e4"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
await ctx.addInitScript(() => {
  window.gapi = {
    load() { },
    client: {
      setToken() { }, getToken() { return { access_token: 'tok' }; },
      drive: {
        files: {
          list() { return Promise.resolve({ result: { files: [] } }); },
          get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); },
        },
      },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
  localStorage.setItem('language', 'bg');
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof createNoteElement === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });

// --- Бележките: маркерът '*' е снимката, точно както стои в текста на бележката ---
const IMG = '/storage/emulated/0/Pictures/Images/' + SMALL;
const span8 = (start, end, paramstring, paramint) => ({ start, end, type: 8, paramstring, paramint });
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');
const star = (i) => i; // маркерът стои на мястото на звездичката

const CASES = [
  {
    // Само снимка: няма ред с думи, значи няма заглавие.
    key: 'only',
    raw: '*',
    format: fmt(span8(0, 1, IMG, 3)),
    wantTitle: '',
    wantHidden: true,
    wantImage: true,
    wantTitleImage: false,
  },
  {
    // Първи ред - снимка, втори - дума: заглавието е думата, а снимката остава в тялото.
    key: 'img-then-word',
    raw: '*\nНачалният екран',
    format: fmt(span8(0, 1, IMG, 3)),
    wantTitle: 'Началният екран',
    wantHidden: false,
    wantImage: true,
    wantTitleImage: false,
  },
  {
    // Текст И снимка на един ред (23.10.2026, трети доклад): този ред ВЕЧЕ е заглавие, а снимката
    // стои НА НЕГО - в заглавието, не в тялото.
    key: 'text-and-img',
    raw: 'Кратка бележка * тук\nДолният ред е заглавие',
    format: fmt(span8(15, 16, IMG, 3)),
    wantTitle: 'Кратка бележка тук',
    wantHidden: false,
    wantImage: false,
    wantTitleImage: true,
    wantPct: 30,
    wantBodyText: 'Долният ред е заглавие',
  },
  {
    // Един ред с текст и снимка и нищо друго: заглавието е текстът със снимката на реда му, а
    // тялото е празно - нито рамка на снимка, нито точка-точка-точка.
    key: 'one-line-mixed',
    raw: 'Кратка бележка * тук',
    format: fmt(span8(15, 16, IMG, 3)),
    wantTitle: 'Кратка бележка тук',
    wantHidden: false,
    wantImage: false,
    wantTitleImage: true,
    wantPct: 30,
    wantBodyText: '',
  },
  {
    // Точно докладът на собственика: заглавие „Дюнер", снимката НА РЕДА на заглавието, а тялото
    // започва с „Дълго въведение" - без воден празен ред и без рамка на снимка.
    key: 'duner',
    raw: 'Дюнер *\n\nДълго въведение\nоще ред',
    format: fmt(span8(6, 7, IMG, 3)),
    wantTitle: 'Дюнер',
    wantHidden: false,
    wantImage: false,
    wantTitleImage: true,
    wantPct: 30,
    wantBodyText: 'Дълго въведение още ред',
  },
  {
    // Снимка на ЦЯЛАТА ширина на картата (paramint 10 = 100%): собственикът (23.10.2026): „Снимката в
    // заглавието трябва да е с размера, с който сме я създали." Тук това се вижда веднага - снимката
    // е колкото картата, а не малка украса до думата.
    key: 'duner-wide',
    raw: 'Дюнер *\n\nДълго въведение',
    format: fmt(span8(6, 7, IMG, 10)),
    wantTitle: 'Дюнер',
    wantHidden: false,
    wantImage: false,
    wantTitleImage: true,
    wantPct: 100,
    wantBodyText: 'Дълго въведение',
  },
  {
    // Празна бележка без снимки: днешното заглавие от три точки остава.
    key: 'empty',
    raw: '   ',
    format: '',
    wantTitle: '...',
    wantHidden: false,
    wantImage: false,
    wantTitleImage: false,
  },
  {
    // Бележка от тип 1 (markdown): първият ред е само снимка, значи заглавие е вторият ред, а
    // снимката остава в тялото.
    key: 'markdown-img-first',
    raw: '*\n**Началният екран**',
    format: fmt(span8(0, 1, IMG, 3)),
    type: 1,
    wantTitle: 'Началният екран',
    wantHidden: false,
    wantImage: true,
    wantTitleImage: false,
  },
  {
    // Обикновена бележка със снимка на ВТОРИЯ ред: заглавието е първият ред (без снимка),
    // снимката е в тялото.
    key: 'plain-then-img',
    raw: 'Обикновена бележка\n*\nи още текст',
    format: fmt(span8('Обикновена бележка\n'.length, 'Обикновена бележка\n'.length + 1, IMG, 3)),
    wantTitle: 'Обикновена бележка',
    wantHidden: false,
    wantImage: true,
    wantTitleImage: false,
    wantBodyText: 'и още текст',
  },
];
for (const c of CASES) {
  // Маркерът трябва да стои точно на звездичката в текста - иначе проверката не мери нищо.
  const at = c.raw.indexOf('*');
  const span = c.format ? JSON.parse(c.format) : null;
  if (span && at >= 0) span.start = at, span.end = at + 1;
  c.format = span ? fmt(span) : '';
  c.starAt = at;
}

const built = await page.evaluate(async ({ cases, small }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  let host = document.getElementById('card-title-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'card-title-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:620px;height:800px;display:flex;flex-direction:column;gap:6px;overflow:hidden;z-index:99999;background:#fff;padding:6px;';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const board0 = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  const out = [];
  for (const c of cases) {
    const id = 950000 + out.length;
    const nt = {
      alarm_type: -1, boardid: board0.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
      eventId: 0, gdid: 'card' + id, id, notetxt: c.raw, numord: id, sellist: 0, status: 0,
      text_span: c.format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: c.type || 0, version: 244,
    };
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    el.style.display = 'flex';
    el.style.contentVisibility = 'visible';
    el.dataset.probeKey = c.key;
    host.appendChild(el);
  }
  // Снимките се теглят по мрежата: изчаква се всяка рамка да е готова (или да се провали).
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const frames = [...host.querySelectorAll('.nm-inline-img')];
    if (frames.length && frames.every(f => f.dataset.nmState && f.dataset.nmState !== 'loading')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  await new Promise(r => requestAnimationFrame(r));
  return [...host.querySelectorAll('.note[data-probe-key]')].map(el => {
    const titleEl = el.querySelector('.note-title-truncated');
    const content = el.querySelector('.note-content');
    const frame = content ? content.querySelector('.nm-inline-img[data-nm-file]') : null;
    // Рамката на снимката В ЗАГЛАВИЕТО (23.10.2026): тя не е в contentEl, затова се търси в titleEl.
    const titleFrame = titleEl ? titleEl.querySelector('.nm-inline-img[data-nm-file]') : null;
    const header = el.querySelector('.note-header-info');
    // Горният ръб на ТЕКСТА в заглавието: по него се мери дали снимката не стърчи над реда.
    let titleTextTop = null;
    if (titleEl) {
      const walker = document.createTreeWalker(titleEl, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue.trim()) continue;
        const r = document.createRange();
        r.setStart(node, 0);
        r.setEnd(node, Math.min(3, node.nodeValue.length));
        titleTextTop = Math.round(r.getBoundingClientRect().top);
        break;
      }
    }
    const tfr = titleFrame ? titleFrame.getBoundingClientRect() : null;
    const cardR = el.getBoundingClientRect();
    return {
      key: el.dataset.probeKey,
      hostW: Math.round(host.getBoundingClientRect().width),
      card: { left: Math.round(cardR.left), right: Math.round(cardR.right), top: Math.round(cardR.top), bottom: Math.round(cardR.bottom) },
      title: titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : null,
      titleHtml: titleEl ? titleEl.innerHTML.slice(0, 240) : null,
      titleDisplay: titleEl ? getComputedStyle(titleEl).display : null,
      titleBox: titleEl ? Math.round(titleEl.getBoundingClientRect().height) : null,
      titleFontSize: titleEl ? parseFloat(getComputedStyle(titleEl).fontSize) : null,
      titleTextTop: titleTextTop,
      titleFrame: titleFrame ? {
        state: titleFrame.dataset.nmState || null,
        view: titleFrame.dataset.nmView || null,
        pct: titleFrame.dataset.nmPct || null,
        top: Math.round(tfr.top),
        h: Math.round(tfr.height),
        w: Math.round(tfr.width),
        left: Math.round(tfr.left),
        right: Math.round(tfr.right),
        vAlign: getComputedStyle(titleFrame).verticalAlign,
      } : null,
      hasTitleEl: !!titleEl,
      header: !!header,
      headerText: header ? header.textContent.trim().slice(0, 24) : null,
      contentText: content ? (() => {
        // Тялото по редове: <br> се брои за интервал. Иначе двете съседни думи се слепват в
        // textContent („въведениеоще“) и проверката за текста на тялото мери друго.
        const clone = content.cloneNode(true);
        clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode(' ')));
        return clone.textContent.replace(/\s+/g, ' ').trim().slice(0, 60);
      })() : null,
      contentHtml: content ? content.innerHTML.slice(0, 200) : null,
      contentW: content ? Math.round(content.getBoundingClientRect().width) : null,
      contentScrollTop: content ? content.scrollTop : null,
      imgState: frame ? (frame.dataset.nmState || null) : null,
      imgPx: frame ? Math.round(frame.getBoundingClientRect().width) : null,
      imgPct: frame ? (frame.dataset.nmPct || null) : null,
      imgs: content ? content.querySelectorAll('.nm-inline-img[data-nm-file]').length : 0,
      markerChar: content ? (content.textContent.includes('*') ? 'star' : 'no-star') : null,
    };
  });
}, { cases: CASES, small: SMALL });

const byKey = {};
built.forEach(b => { byKey[b.key] = b; });
ok(built.length === CASES.length, `всичките ${CASES.length} карти се построиха (${built.map(b => b.key).join(', ')})`, built);

// --- 1. Общо за всеки случай: заглавието е точно очакваният текст, рамката на снимката е там,
// където я очакваме (на реда на заглавието или в тялото), а редът с датата и часа си стои. ---
for (const c of CASES) {
  const b = byKey[c.key];
  ok(!!b, `${c.key}: картата се построи`, b);
  if (!b) continue;
  ok(b.title === c.wantTitle,
    `${c.key}: заглавието е „${c.wantTitle}“ („${b.title}“)`, b);
  ok((b.titleDisplay === 'none') === !!c.wantHidden,
    `${c.key}: заглавието ${c.wantHidden ? 'е скрито' : 'се вижда'} (display ${b.titleDisplay})`, b);
  ok(!!b.titleFrame === !!c.wantTitleImage,
    `${c.key}: ${c.wantTitleImage ? 'снимката е в заглавието' : 'в заглавието няма снимка'} (${!!b.titleFrame})`, b);
  ok(b.imgs === (c.wantImage ? 1 : 0),
    `${c.key}: ${c.wantImage ? 'снимката е в тялото' : 'в тялото няма рамка на снимка'} (${b.imgs} рамки)`, b);
  if (c.wantBodyText !== undefined) {
    ok(String(b.contentText) === c.wantBodyText,
      `${c.key}: тялото е „${c.wantBodyText}“ („${b.contentText}“)`, b);
  }
  ok(b.header === true && !!b.headerText,
    `${c.key}: редът с датата и часа си остава (${b.headerText})`, b);
  ok(b.markerChar === 'no-star',
    `${c.key}: знакът на маркера не се вижда като текст (${b.markerChar})`, b);
  ok(b.contentScrollTop === 0,
    `${c.key}: картата не е превъртяна (scrollTop ${b.contentScrollTop})`, b);
}

// --- 2. Снимката в заглавието е С РАЗМЕРА, С КОИТО Е СЪЗДАДЕНА (23.10.2026, четвърти доклад на
// собственика: „Снимката в заглавието трябва да е с размера, с който сме я създали"). Значи:
// заредена, с ширината на същия процент от колоната като в тялото, с горен ръб на нивото на текста
// и изцяло в картата. Заглавието вече МОЖЕ да расте по височина - снимката не се смалява. ---
const CARD = built[0].hostW; // ширината на картата (host) - по нея се смята процентът
for (const c of CASES) {
  if (!c.wantTitleImage) continue;
  const b = byKey[c.key];
  if (!b || !b.titleFrame) { ok(false, `${c.key}: има рамка на снимка в заглавието`, b); continue; }
  const f = b.titleFrame;
  ok(f.state === 'ready', `${c.key}: снимката в заглавието е заредена (${f.state})`, b);
  ok(f.view === 'title', `${c.key}: рамката е в режим на заглавие, не на бележка (data-nm-view ${f.view})`, b);
  ok(f.w > 0 && f.h > 0, `${c.key}: снимката в заглавието има реални размери (${f.w}×${f.h})`, b);
  // Същата ширина като в тялото: процентът е записан на рамката (data-nm-pct), а ширината се мери
  // спрямо ширината на КАРТАТА - така се вижда дали снимката е с размера си, а не смалена украса.
  ok(String(f.pct) === String(c.wantPct),
    `${c.key}: рамката помни процента, с който е създадена снимката (${f.pct}, очаквано ${c.wantPct})`, b);
  // Мярката е КОЛОНАТА на бележката (.note-content): точно по нея се смята процентът и в тялото,
  // значи същият процент трябва да даде същите пиксели - „с размера, с който сме я създали".
  const colW = b.contentW || CARD;
  const wantW = Math.round(colW * Number(c.wantPct) / 100);
  ok(Math.abs(f.w - wantW) <= 8,
    `${c.key}: ширината е ${c.wantPct}% от колоната на бележката (${f.w}px, очаквано ~${wantW}px)`, b);
  // Не е смалена украса: процентът стига и до височината - картинката е 300×225, значи 100% ширина
  // дава снимка, по-висока от един ред текст.
  if (Number(c.wantPct) >= 50) {
    ok(f.h > (b.titleFontSize || 16) * 1.6,
      `${c.key}: високата снимка не е смалена до реда (${f.h}px при шрифт ${b.titleFontSize}px)`, b);
  }
  ok(b.titleTextTop === null || f.top >= b.titleTextTop - 2,
    `${c.key}: горният ръб на снимката не е над горния ръб на текста в заглавието (${b.titleTextTop === null ? '?' : f.top - b.titleTextTop}px)`, b);
  ok(f.left >= b.card.left - 1 && f.right <= b.card.right + 1,
    `${c.key}: снимката не излиза извън картата (ляво ${f.left - b.card.left}px, дясно ${f.right - b.card.right}px)`, b);
  ok(b.contentScrollTop === 0, `${c.key}: картата не е превъртяна (scrollTop ${b.contentScrollTop})`, b);
}

// --- 3. Точно докладът на собственика (23.10.2026): „снимката е на долния ред а заглавието е само
// думата Дюнер... те да останат на реда, а не да слизат отдолу". ---
const duner = byKey['duner'];
ok(!!duner && duner.title === 'Дюнер' && duner.titleDisplay !== 'none',
  `Дюнер: заглавието е само думата „Дюнер“ („${duner && duner.title}“)`, duner);
ok(!!duner && !!duner.titleFrame && duner.titleFrame.state === 'ready',
  `Дюнер: снимката стои НА РЕДА на заглавието и е заредена (${duner && duner.titleFrame && duner.titleFrame.state})`, duner);
ok(!!duner && duner.imgs === 0,
  `Дюнер: в тялото НЯМА рамка на снимка (${duner && duner.imgs})`, duner);
ok(!!duner && String(duner.contentText) === 'Дълго въведение още ред',
  `Дюнер: тялото започва с „Дълго въведение“ - без воден празен ред и без разбъркан текст („${duner && duner.contentText}“)`, duner);

// --- 4. Заглавие с явен разделител '|' продължава да печели (и снимката му остава в тялото). ---
const piped = await page.evaluate(async () => {
  const host = document.getElementById('card-title-host');
  host.innerHTML = '';
  const board0 = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  // При явен разделител '|' записът (text_span) е в координати на ТЯЛОТО, не на целия текст.
  const raw = 'Явно заглавие|*\nпод него';
  const at = raw.substring(raw.indexOf('|') + 1).indexOf('*');
  const nt = {
    alarm_type: -1, boardid: board0.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
    eventId: 0, gdid: 'cardPiped', id: 950900, notetxt: raw, numord: 950900, sellist: 0, status: 0,
    text_span: JSON.stringify({ start: at, end: at + 1, type: 8, paramstring: '/storage/emulated/0/Pictures/Images/file_0000.png', paramint: 3 }),
    title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
  };
  allNotesData.push(nt);
  const el = await createNoteElement(nt);
  el.style.display = 'flex';
  el.style.contentVisibility = 'visible';
  host.appendChild(el);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const f = el.querySelector('.note-content .nm-inline-img');
    if (f && f.dataset.nmState && f.dataset.nmState !== 'loading') break;
    await new Promise(r => setTimeout(r, 40));
  }
  const frame = el.querySelector('.note-content .nm-inline-img');
  const titleEl = el.querySelector('.note-title-truncated');
  return {
    title: titleEl ? titleEl.textContent : null,
    titleFrames: titleEl ? titleEl.querySelectorAll('.nm-inline-img').length : 0,
    imgState: frame ? (frame.dataset.nmState || null) : null,
    imgs: el.querySelectorAll('.note-content .nm-inline-img').length,
    contentText: el.querySelector('.note-content') ? el.querySelector('.note-content').textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : null,
  };
});
ok(piped.title === 'Явно заглавие' && piped.imgs === 1 && piped.imgState === 'ready' && piped.titleFrames === 0,
  `явният разделител '|' пак дава заглавието, а снимката е в тялото („${piped.title}“, ${piped.imgs} рамка, в заглавието ${piped.titleFrames})`, piped);

// --- 5. Линията с датата и часът не се пипат от скриването на заглавието ---
ok(built.every(b => b.header === true),
  `редът с датата и часа стои на всичките карти (${built.map(b => b.header).join(', ')})`, built);

if (SHOTS) await page.screenshot({ path: `${SHOTS}-card-titles.png`, fullPage: false });

// --- 8. Никакви грешки ---
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('Drive заявки: ' + JSON.stringify(DRIVE.list.slice(0, 10)));
  console.log('thumbnail заявки: ' + JSON.stringify(DRIVE.thumb.slice(0, 10)));
  console.log('състояния: ' + JSON.stringify(built));
}
await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
