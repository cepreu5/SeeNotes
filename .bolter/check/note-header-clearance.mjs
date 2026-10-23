// Снимката в картата на борда не бива да застъпва хедъра с датата/часа (23.10.2026, шести доклад на
// собственика): „Пак се прояви проблемът със застъпването на хедъра от снимките".
// Причината: хедърът `.note-header-info` е `position: absolute; top: 25px` и НЕ участва в layout-а.
// Единственото, което държи тялото на картата далеч от него, е `margin-top: 50px` на
// `.note-title-truncated`. Когато заглавието се скрие (`display: none` - бележка без ред с думи,
// само снимка или само линк), този марж изчезва и тялото започва от самия връх на картата.
// Тестът мери ИСТИНСКАТА геометрия на карта, построена през createNoteElement:
//   a) ред-само-линк + ред със снимка        -> заглавие скрито, снимката е в тялото
//   b) бележката на собственика: снимка / прикрит ред / линк -> заглавие скрито
//   c) бележка само със снимка                -> заглавие скрито
//   d) контрола: обикновена бележка с текстово заглавие -> заглавието се вижда
// За всяка: headerBottom (долният ръб на хедъра) и firstBodyTop/bodyTopMin (горният ръб на първия
// видим елемент в тялото). Застъпване има, когато bodyTopMin < headerBottom.
// Пуска се от корена на хранилището:
//   node .bolter/check/note-header-clearance.mjs      (exit 1 при провалена проверка)
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
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
  if (!cond) fails++;
};

// --- Фалшив Drive за вградената снимка (type=8): име -> файл -> thumbnailLink -> картинка ---
const SMALL = 'file_0000.png';
const SMALL_ID = 'FILE0000';
const IMG = '/storage/emulated/0/Pictures/Images/' + SMALL;
const WIDE = 300;

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
// Нищо извън localhost: gsi клиентът получава празен заместител, за да не гърми app-ът.
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const u = new URL(url);
    const q = u.searchParams.get('q') || '';
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    const fileIdMatch = url.match(/\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
    if (fileIdMatch) {
      const fileId = decodeURIComponent(fileIdMatch[1]);
      if (fileId !== SMALL_ID) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s800` }) });
    }
    if (name === SMALL) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: SMALL_ID, name: SMALL, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
    }
    const looksFolder = /vnd\.google-apps\.folder/.test(q);
    if (looksFolder) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
    }
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
await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));

// Връща измерванията за карта на борда, построена през истинския createNoteElement.
const measureCard = (txt, format, oneTap) => page.evaluate(async ({ txt, format, oneTap }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  localStorage.setItem('oneTapLink', oneTap ? 'true' : 'false');
  // Картата се слага в собствен видим контейнер: #notes-container е с височина 0 и картите в него
  // не се подреждат (content-visibility: auto ги пропуска) - тогава геометрията е 0x0.
  let host = document.getElementById('header-clearance-probe-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'header-clearance-probe-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:700px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;z-index:99999;background:#fff;';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const board = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  const id = 900000 + Math.floor(Math.random() * 90000);
  const nt = {
    alarm_type: -1, boardid: board.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
    eventId: 0, gdid: 'probe' + id, id, notetxt: txt, numord: id, sellist: 0, status: 0,
    text_span: format || '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
  };
  allNotesData.push(nt);
  const el = await createNoteElement(nt);
  el.dataset.probe = String(id);
  // Извън истинския борд картата идва с inline display:none (бележката не е за показване) - тук я
  // правим видима, за да има реален layout, и на истинския борд тя е на екрана.
  el.style.display = 'flex';
  el.style.contentVisibility = 'visible';
  host.appendChild(el);
  // Рамката на вградената снимка се пълни по мрежата: изчаква се да излезе от „loading" (или да
  // се провали) - иначе снимката не се брои за нищо.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const frames = [...el.querySelectorAll('.nm-inline-img')];
    if (!frames.length || frames.every(f => f.dataset.nmState && f.dataset.nmState !== 'loading')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const card = document.querySelector(`.note[data-probe="${id}"]`);
  const titleWrapper = card && card.querySelector('.note-title-wrapper');
  const titleEl = card && card.querySelector('.note-title-truncated');
  const header = card && card.querySelector('.note-header-info');
  const headerDate = card && card.querySelector('.note-header-date');
  const content = card && card.querySelector('.note-content');
  if (!content) {
    el.remove();
    allNotesData.splice(allNotesData.indexOf(nt), 1);
    return { missing: true };
  }
  const contentOf = (el2) => {
    const clone = el2.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode(' ')));
    return clone.textContent.replace(/\s+/g, ' ').trim();
  };
  const visible = (node) => {
    if (!node) return false;
    const st = getComputedStyle(node);
    return st.display !== 'none' && st.visibility !== 'hidden';
  };
  // Най-горната точка на ТЯЛОТО: най-малкият top сред всички видими листови възли в .note-content
  // (рамката на снимката, текст, линк). Точно това би застъпило хедъра.
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let firstBodyTop = null, bodyTopMin = null, firstBodyKind = null;
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === 3) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.height <= 0) continue;
      if (firstBodyTop === null) { firstBodyTop = r.top; firstBodyKind = 'text'; }
      if (bodyTopMin === null || r.top < bodyTopMin) bodyTopMin = r.top;
      continue;
    }
    if (!visible(node)) continue;
    if (node.classList.contains('nm-inline-img')) {
      const r = node.getBoundingClientRect();
      if (r.height <= 0) continue;
      if (firstBodyTop === null) { firstBodyTop = r.top; firstBodyKind = 'img-frame' + (node.dataset.nmState ? ':' + node.dataset.nmState : ''); }
      if (bodyTopMin === null || r.top < bodyTopMin) bodyTopMin = r.top;
      // Вътре в рамката няма нужда да се слиза - тя е кутията на снимката.
      continue;
    }
    if (node.children.length === 0) {
      const t = (node.textContent || '').trim();
      if (!t) continue;
      const r = node.getBoundingClientRect();
      if (r.height <= 0) continue;
      if (firstBodyTop === null) { firstBodyTop = r.top; firstBodyKind = 'leaf:' + node.tagName.toLowerCase(); }
      if (bodyTopMin === null || r.top < bodyTopMin) bodyTopMin = r.top;
    }
  }
  const frames = [...content.querySelectorAll('.nm-inline-img')];
  const links = [...content.querySelectorAll('a, .nmd-link-elide')];
  const round = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
  const headerRect = header ? header.getBoundingClientRect() : null;
  const headerDateRect = headerDate ? headerDate.getBoundingClientRect() : null;
  const cardRect = card.getBoundingClientRect();
  const out = {
    cardTop: round(cardRect.top), cardW: Math.round(cardRect.width), cardH: Math.round(cardRect.height),
    titleText: titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : null,
    titleDisplay: titleEl ? getComputedStyle(titleEl).display : null,
    titleInlineDisplay: titleEl ? titleEl.style.display : null,
    titleWrapperH: titleWrapper ? Math.round(titleWrapper.getBoundingClientRect().height) : null,
    headerTop: headerRect ? round(headerRect.top) : null,
    headerBottom: headerRect ? round(headerRect.bottom) : null,
    headerDateTop: headerDateRect ? round(headerDateRect.top) : null,
    headerDateBottom: headerDateRect ? round(headerDateRect.bottom) : null,
    firstBodyTop: round(firstBodyTop), firstBodyKind,
    bodyTopMin: round(bodyTopMin),
    bodyGap: round(bodyTopMin !== null && headerRect ? bodyTopMin - headerRect.bottom : null),
    contentMarginTop: content ? getComputedStyle(content).marginTop : null,
    contentTop: round(content.getBoundingClientRect().top),
    frames: frames.length,
    frameStates: frames.map(f => f.dataset.nmState || null),
    frameTop: frames.length ? round(frames[0].getBoundingClientRect().top) : null,
    frameH: frames.length ? Math.round(frames[0].getBoundingClientRect().height) : null,
    linkCount: links.length,
    linkTexts: links.map(l => l.textContent.trim().slice(0, 40)),
    linkTop: links.length ? round(links[0].getBoundingClientRect().top) : null,
    contentText: contentOf(content),
    cardClass: card.className,
  };
  el.remove();
  allNotesData.splice(allNotesData.indexOf(nt), 1);
  return out;
}, { txt, format, oneTap });

// Форматът на вградената снимка: един знак (маркерът „*") в координатите на ЦЕЛИЯ текст.
const span8 = (start, end, paramstring, paramint) => JSON.stringify({ start, end, type: 8, paramstring, paramint });
const IMG_PARAMINT = 3;

const URL1 = 'https://youtu.be/QTO1abc';
const URL2 = 'https://youtu.be/QTO1sLqi0VY';
const HIDDEN_SENTENCE = 'НАРОДЪТ, КОЙТО ЗАГУБИ ИМЕТО, ЕЗИКА И ЕЛИТА СИ.';

// Тихите (скрити) бележки: заглавие НЯМА да има - то трябва да е display:none, за да минава тестът
// по скрития път, в който се прояви застъпването.
const cases = [
  {
    key: 'a',
    label: 'a) ред-само-линк + ред със снимка',
    txt: URL1 + '\n*',
    format: span8((URL1 + '\n*').indexOf('*'), (URL1 + '\n*').indexOf('*') + 1, IMG, IMG_PARAMINT),
  },
  {
    key: 'b',
    label: 'b) докладът на собственика: снимка / прикрит ред / линк',
    txt: '*' + '\n' + HIDDEN_SENTENCE + '\n' + URL2,
    format: [
      span8(0, 1, IMG, IMG_PARAMINT),
      JSON.stringify({ start: 2, end: 2 + HIDDEN_SENTENCE.length, type: 4, paramint: 0xFFF0F0F0 }),
      JSON.stringify({ start: 2, end: 2 + HIDDEN_SENTENCE.length, type: 5, paramint: 0xFF0F0F0F }),
    ].join('|'),
  },
  {
    key: 'c',
    label: 'c) бележка само със снимка',
    txt: '*',
    format: span8(0, 1, IMG, IMG_PARAMINT),
  },
  {
    key: 'd',
    label: 'd) контрола: обикновена бележка с текстово заглавие',
    txt: 'Първи ред\nвтори ред',
    format: '',
  },
];

const measured = {};
console.log('--- измервания на картата (viewport 1280x900) ---');
for (const c of cases) {
  const m = await measureCard(c.txt, c.format, false);
  measured[c.key] = m;
  if (m.missing) { ok(false, `${c.label}: картата се рендира`, m); continue; }
  console.log(`${c.label}`);
  console.log(`   заглавие: display=${m.titleDisplay} (inline „${m.titleInlineDisplay}"), текст=„${m.titleText}", ред ${m.titleWrapperH}px`);
  console.log(`   хедър: top=${m.headerTop} bottom=${m.headerBottom} (дата: ${m.headerDateTop}..${m.headerDateBottom})`);
  console.log(`   тяло: първи елемент „${m.firstBodyKind}" top=${m.firstBodyTop}, най-горна точка=${m.bodyTopMin} (content top=${m.contentTop}, margin-top=${m.contentMarginTop})`);
  console.log(`   снимка: ${m.frames} рамки, top=${m.frameTop}, h=${m.frameH} | линк: ${m.linkCount} top=${m.linkTop}`);
  console.log(`   РАЗЛИКА тяло-хедър: ${m.bodyGap}px ${m.bodyGap !== null && m.bodyGap < 0 ? '<-- ЗАСТЪПВАНЕ' : ''}`);
}
console.log('--- проверки ---');
// --- Регресията: тялото на картата стои ПОД хедъра (без застъпване) ---
// Толеранс 2px: хедърът е absolute на top: 25px, а тялото започва след 50px-ия ред на скритото
// заглавие - двете не се докосват, но не се искат пиксел в пиксел равни стойности.
const CLEARANCE = 2;
for (const c of cases) {
  const m = measured[c.key];
  if (!m || m.missing) { ok(false, `${c.label}: картата се рендира`, m); continue; }
  ok(m.cardW > 0 && m.cardH > 0, `${c.label}: картата е подредена (${m.cardW}x${m.cardH})`, m);
  ok(m.bodyTopMin !== null && m.headerBottom !== null && m.bodyTopMin >= m.headerBottom + CLEARANCE,
    `${c.label}: тялото НЕ застъпва хедъра (тяло ${m.bodyTopMin} >= хедър ${m.headerBottom} + ${CLEARANCE}; разлика ${m.bodyGap}px)`, m);
  ok(m.firstBodyTop !== null && m.bodyTopMin !== null && m.firstBodyTop >= m.headerBottom + CLEARANCE,
    `${c.label}: първият елемент на тялото е под хедъра (${m.firstBodyTop} >= ${m.headerBottom} + ${CLEARANCE}, „${m.firstBodyKind}")`, m);
}

// За скритите бележки (a, b, c) заглавието наистина е скрито - тестът минава по скрития път.
for (const key of ['a', 'b', 'c']) {
  const m = measured[key];
  const label = cases.find(c => c.key === key).label;
  ok(m && m.titleDisplay === 'none' && !m.titleText,
    `${label}: заглавието е СКРИТО (display ${m && m.titleDisplay}, „${m && m.titleText}")`, m);
  ok(m && m.titleWrapperH >= 50,
    `${label}: редът на скритото заглавие пази 50px за хедъра (${m && m.titleWrapperH}px)`, m);
  ok(m && m.frames === 1 && m.frameH > 0,
    `${label}: снимката е в тялото и се вижда (${m && m.frames} рамки, h=${m && m.frameH})`, m);
}

// Контролата: заглавието се вижда и тялото е под него, както досега.
ok(measured.d && measured.d.titleDisplay !== 'none' && measured.d.titleText === 'Първи ред',
  `d) контрола: заглавието се вижда (display ${measured.d && measured.d.titleDisplay}, „${measured.d && measured.d.titleText}")`, measured.d);
ok(measured.d && String(measured.d.contentText).includes('втори ред'),
  `d) контрола: тялото е вторият ред („${measured.d && measured.d.contentText}")`, measured.d);

// При (a) и (b) линкът също остава в тялото, видим.
for (const key of ['a', 'b']) {
  const m = measured[key];
  const label = cases.find(c => c.key === key).label;
  ok(m && m.linkCount === 1 && m.linkTop !== null,
    `${label}: линкът е в тялото и се вижда (${m && m.linkCount} линка, top=${m && m.linkTop})`, m);
}

// --- Никакви грешки в конзолата / страницата ---
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);

await browser.close(); srv.close();
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
