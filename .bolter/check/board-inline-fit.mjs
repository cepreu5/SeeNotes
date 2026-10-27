// Как големи вложени снимки (text_span type=8) се показват в бележка НА БОРДА: БЕЗ скрол.
// Цялата снимка трябва да се вижда, значи високата снимка се смалява по ширина, а широката и
// малката остават със същите размери. Мери се истинският път: createNoteElement с фалшив
// Drive, който връща ГОЛЯМА снимка.
//   node .bolter/check/board-inline-fit.mjs
import { chromium } from '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
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

const FOLDER_IMAGES = 'FOLDER_IMAGES';
// Големи снимки: широка (1600x900) и висока (1600x2200, като картата на ЕС от снимката).
const IMGS = {
  'wide.png': { w: 1600, h: 900 },
  'tall.png': { w: 1600, h: 2200 },
  'small.png': { w: 480, h: 320 },
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

async function run(viewport, label, hasTouch) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', hasTouch: !!hasTouch });
  await ctx.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
    if (meta) {
      const id = decodeURIComponent(meta[1]);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${id}=s800` }) });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
      const q = new URL(url).searchParams.get('q') || '';
      const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
      if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: name === 'Images' ? FOLDER_IMAGES : 'F_' + name, name }] }) });
      }
      if (IMGS[name]) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'ID_' + name, name, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
      if (name === 'multinotes_data') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_MD', name }] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
    }
    if (url.startsWith('https://thumb.invalid/')) {
      const id = decodeURIComponent(url.split('/').pop());
      const name = id.replace(/^ID_/, '').replace(/=s800$/, '');
      const dim = IMGS[name] || IMGS['wide.png'];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim.w}" height="${dim.h}"><rect width="100%" height="100%" fill="#c6d2e4"/><rect x="0" y="0" width="${dim.w}" height="40" fill="#3a6ff0"/></svg>`;
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
    }
    if (url.startsWith('https://accounts.google.com/gsi/client')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await ctx.addInitScript(() => {
    window.gapi = { load() { }, client: { setToken() { }, getToken() { return { access_token: 'tok' }; }, drive: { files: { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: {} }); } } } } };
    window.gapi.auth = { getToken() { return { access_token: 'tok' }; } };
    sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
    localStorage.setItem('language', 'bg');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof startApp === 'function' && typeof createNoteElement === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
  await page.waitForFunction(() => contentModal, null, { timeout: 20000 });

  // Всеки случай: какво трябва да се види. w/h са очакваните размери на рамката в пиксели -
  // снимката НЕ се смалява, за да влезе; когато е по-висока от тялото, тялото се скролира.
  // Всеки случай: какво трябва да се види. w/h са очакваните размери на рамката, когато снимката
  // се побира и без смаляване; за високата снимка няма w/h - тя се смалява, за да се побере.
  const CASES = [
    { key: 'wide-only-100', raw: '*', file: 'wide.png', pct: 10, w: 205, h: 115 },
    { key: 'tall-only', raw: '*', file: 'tall.png', pct: 10 },
    { key: 'wide-50', raw: '*', file: 'wide.png', pct: 5, w: 205, h: 115 },
    { key: 'tall-with-text', raw: '*\nнародни представители', file: 'tall.png', pct: 10 },
    { key: 'tall-in-body-text', raw: 'Обикновена бележка\n*\nи още текст', file: 'tall.png', pct: 10 },
    // С футър с икони (бележка с прикачен файл): футърът е absolute върху долните 35px на картата.
    { key: 'tall-with-footer', raw: '*', file: 'tall.png', pct: 10, footer: true },
    { key: 'small-only', raw: '*', file: 'small.png', pct: 10, w: 205, h: 137 },
  ];

  const out = await page.evaluate(async ({ cases }) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOffline = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    let host = document.getElementById('big-inline-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'big-inline-host';
      host.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;display:flex;flex-wrap:wrap;gap:10px;overflow:hidden;z-index:99999;background:#ddd;padding:8px;';
      document.body.appendChild(host);
    }
    host.innerHTML = '';
    const board0 = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
    const res = [];
    for (const c of cases) {
      const id = 970000 + res.length;
      const span = { start: c.raw.indexOf('*'), end: c.raw.indexOf('*') + 1, type: 8, paramstring: '/storage/emulated/0/Pictures/Images/' + c.file, paramint: c.pct };
      const gdid = 'big' + id + Date.now();
      const nt = {
        alarm_type: -1, boardid: board0.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
        eventId: 0, gdid, id, notetxt: c.raw, numord: id, sellist: 0, status: 0,
        text_span: JSON.stringify(span), title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
      };
      // Прикачен файл: картата строи футър с икони (.note-footer).
      if (c.footer && typeof mediaData !== 'undefined' && Array.isArray(mediaData)) {
        mediaData.push({ noteid: gdid, path: 'photo.jpg', pathGD: 'ID_photo.jpg', type: 1, name: 'photo.jpg' });
      }
      allNotesData.push(nt);
      const el = await createNoteElement(nt);
      el.style.display = 'flex';
      el.style.contentVisibility = 'visible';
      el.dataset.probeKey = c.key;
      host.appendChild(el);
      res.push(c.key);
    }
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const frames = [...host.querySelectorAll('.nm-inline-img')];
      if (frames.length === cases.length && frames.every(f => f.dataset.nmState && f.dataset.nmState !== 'loading')) break;
      await new Promise(r => setTimeout(r, 40));
    }
    await new Promise(r => requestAnimationFrame(r));

    // Видимата част на тялото: под заглавието (ръбът на .note-content), над ръба на картата и над
    // футъра с иконите (той е absolute и закрива долните 35px).
    const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
    const overlap = (frame, top, bottom) => {
      if (!frame) return 0;
      const vis = Math.min(frame.bottom, bottom) - Math.max(frame.top, top);
      return Math.max(0, Math.min(frame.h, vis));
    };

    return [...host.querySelectorAll('.note[data-probe-key]')].map(el => {
      const card = rect(el);
      const content = el.querySelector('.note-content');
      const frameEl = content ? content.querySelector('.nm-inline-img[data-nm-file]') : null;
      const img = frameEl ? frameEl.querySelector('img') : null;
      const footerEl = el.querySelector('.note-footer');
      const footer = rect(footerEl);
      const cRect = rect(content);
      const cs = content ? getComputedStyle(content) : null;
      const scrollMax = content ? Math.max(0, content.scrollHeight - content.clientHeight) : 0;
      // Границите на видимото тяло, преди и след скрол до края.
      const visibleTop = cRect ? cRect.top : card.top;
      const visibleBottom = Math.min(card.bottom, cRect ? cRect.top + (content ? content.clientHeight : 0) : card.bottom, footer ? footer.top : Infinity);
      if (content) content.scrollTop = 0;
      const beforeFrame = rect(frameEl);
      // Достижимост: минаваме целия скрол и обединяваме видяното от снимката. Така се хваща
      // „последната ивица остава под футъра/под ръба на картата" - тя просто не влиза в нито
      // едно положение. Снимка по-висока от тялото не може да се види цялата наведнъж; въпросът е
      // дали всеки неин пиксел се стига.
      const spans = [];
      if (beforeFrame) spans.push([Math.max(beforeFrame.top, visibleTop) - beforeFrame.top, Math.min(beforeFrame.bottom, visibleBottom) - beforeFrame.top]);
      if (content) {
        const step = 6;
        for (let st = step; st <= scrollMax + step; st += step) {
          content.scrollTop = Math.min(st, scrollMax);
          const fr = rect(frameEl);
          if (!fr) break;
          const a = Math.max(fr.top, visibleTop) - fr.top;
          const b = Math.min(fr.bottom, visibleBottom) - fr.top;
          if (b > a) spans.push([a, b]);
        }
        content.scrollTop = content.scrollHeight;
      }
      const afterFrame = rect(frameEl);
      const scrollTopAtMax = content ? content.scrollTop : 0;
      let covered = 0;
      if (beforeFrame) {
        const clipped = spans
          .map(([a, b]) => [Math.max(0, a), Math.min(beforeFrame.h, b)])
          .filter(([a, b]) => b > a)
          .sort((p, q) => p[0] - q[0]);
        let cursor = 0;
        for (const [a, b] of clipped) {
          if (b <= cursor) continue;
          covered += b - Math.max(a, cursor);
          cursor = b;
        }
      }
      return {
        key: el.dataset.probeKey,
        hasScrollClass: el.classList.contains('note-body-scroll'),
        card, footer, content: cRect ? { ...cRect, clientH: content.clientHeight, scrollH: content.scrollHeight, scrollW: content.scrollWidth, clientW: content.clientWidth } : null,
        overflowY: cs ? cs.overflowY : null,
        paddingBottom: cs ? cs.paddingBottom : null,
        scrollMax,
        scrollTopAtMax,
        frame: beforeFrame,
        frameAtMax: afterFrame,
        frameStyleW: frameEl ? frameEl.style.width : null,
        natural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
        state: frameEl ? frameEl.dataset.nmState : null,
        // Числата за сравнение преди/след: колко от снимката се вижда без скрол и след скрол до края.
        visibleTop, visibleBottom,
        visibleFractionTop: beforeFrame ? +(overlap(beforeFrame, visibleTop, visibleBottom) / beforeFrame.h).toFixed(3) : null,
        visibleFractionMax: afterFrame ? +(overlap(afterFrame, visibleTop, visibleBottom) / afterFrame.h).toFixed(3) : null,
        reachableFraction: beforeFrame ? +(covered / beforeFrame.h).toFixed(3) : null,
        clippedByCardTop: beforeFrame ? Math.round(beforeFrame.bottom - card.bottom) : null,
        underFooterAtMax: (afterFrame && footer) ? Math.round(afterFrame.bottom - footer.top) : null,
        frameBottomOverCardAtMax: afterFrame ? Math.round(afterFrame.bottom - card.bottom) : null,
        insideCardX: beforeFrame ? (beforeFrame.left >= card.left && beforeFrame.right <= card.right) : null,
        horizontalOverflowPx: (content && beforeFrame) ? Math.round(Math.max(0, beforeFrame.right - cRect.right, cRect.left - beforeFrame.left)) : null,
      };
    });
  }, { cases: CASES });

  console.log('===== ' + label + ' (' + viewport.width + 'x' + viewport.height + ') =====');
  for (const r of out) console.log(JSON.stringify(r));

  // Договорът (собственик, 27.10.2026): в картата НЯМА скрол - цялата снимка се вижда. Ако при
  // ширината си е по-висока от тялото, ширината се смалява пропорционално; широката и малката
  // снимка остават със същите размери, както дотук.
  for (const c of CASES) {
    const r = out.find(x => x.key === c.key);
    const t = label + '/' + c.key;
    ok(!!r, `${t}: картата е измерена`, r);
    if (!r) continue;
    ok(r.state === 'ready', `${t}: снимката е заредена (${r.state})`, r);
    ok(!r.hasScrollClass, `${t}: картата не е с класа за скрол (.note-body-scroll)`, r);
    ok(r.scrollMax === 0, `${t}: в картата няма какво да се скролира (scrollMax ${r.scrollMax})`, r);
    ok(r.visibleFractionTop >= 0.999, `${t}: цялата снимка се вижда без скрол (${r.visibleFractionTop})`, r);
    ok(r.frame.bottom <= r.visibleBottom + 1,
      `${t}: долният ръб на снимката е над ръба на картата/футъра (${r.frame.bottom} срещу ${Math.round(r.visibleBottom)})`, r);
    ok(r.frame.top >= r.content.top - 1, `${t}: горният ръб на снимката е под ръба на тялото`, r);
    ok(r.insideCardX !== false && r.horizontalOverflowPx === 0,
      `${t}: снимката не излиза от картата по хоризонтала (${r.horizontalOverflowPx}px)`, r);
    const ratio = r.natural ? r.natural.h / r.natural.w : 0;
    ok(ratio > 0 && Math.abs(r.frame.h / r.frame.w - ratio) < 0.03,
      `${t}: снимката е в същите пропорции (${r.frame.w}x${r.frame.h})`, r);
    if (c.w) {
      ok(r.frame.w === c.w && r.frame.h === c.h,
        `${t}: снимката е със същите размери (${r.frame.w}x${r.frame.h}, очаквано ${c.w}x${c.h})`, r);
    } else {
      const availH = Math.round(r.visibleBottom - r.content.top);
      ok(r.frame.w < 205, `${t}: високата снимка е смалена по ширина (${r.frame.w} < 205)`, r);
      ok(r.frame.h <= availH, `${t}: височината се побира в тялото (${r.frame.h} <= ${availH})`, r);
      ok(r.frame.w >= 60, `${t}: снимката не е смалена до невидимо (${r.frame.w}px)`, r);
    }
  }

  const offscreen = await page.evaluate(async () => {
    const big = document.getElementById('big-inline-host');
    if (big) big.style.display = 'none';
    const g = document.getElementById('gesture-host');
    if (g) g.style.display = 'none';
    const pad = document.createElement('div');
    pad.id = 'offscreen-pad';
    pad.style.cssText = 'height:4000px;';
    document.body.insertBefore(pad, document.body.firstChild);
    const host = document.createElement('div');
    host.id = 'offscreen-host';
    host.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;position:absolute;left:0;top:4000px;width:100%;';
    document.body.appendChild(host);
    const id = 995001, gdid = 'off' + Date.now();
    const span = { start: 0, end: 1, type: 8, paramstring: '/storage/emulated/0/Pictures/Images/tall.png', paramint: 10 };
    const nt = { alarm_type: -1, boardid: null, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0, gdid, id, notetxt: '*', numord: id, sellist: 0, status: 0, text_span: JSON.stringify(span), title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244 };
    if (Array.isArray(mediaData)) mediaData.push({ noteid: gdid, path: 'photo.jpg', pathGD: 'ID_photo.jpg', type: 1, name: 'photo.jpg' });
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    el.style.display = 'flex';
    el.dataset.probeKey = 'offscreen';
    host.appendChild(el);
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const f = el.querySelector('.nm-inline-img');
      if (f && f.dataset.nmState && f.dataset.nmState !== 'loading') break;
      await new Promise(r => setTimeout(r, 40));
    }
    await new Promise(r => requestAnimationFrame(r));
    const fr = () => { const f = el.querySelector('.nm-inline-img'); const b = f ? f.getBoundingClientRect() : null; return b ? Math.round(b.width) : 0; };
    const before = { top: Math.round(el.getBoundingClientRect().top), clientH: el.querySelector('.note-content').clientHeight, w: fr() };
    el.scrollIntoView({ block: 'center' });
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 50));
      if (fr() < before.w) break;
    }
    const content = el.querySelector('.note-content');
    return {
      before,
      after: { top: Math.round(el.getBoundingClientRect().top), clientH: content.clientHeight, w: fr(), scrollMax: content.scrollHeight - content.clientHeight },
    };
  });
  // Карта, която още не е подредена (content-visibility: auto извън изгледа), не може да се измери:
  // ширината остава изчислената, а щом картата влезе в изгледа, високата снимка се смалява.
  ok(offscreen.after.w > 0 && offscreen.after.w < 205,
    `${label}: картата на дълъг борд е със смалена висока снимка (${offscreen.after.w}px < 205)`, offscreen);
  ok(offscreen.after.scrollMax === 0,
    `${label}: смалената снимка се побира без скрол (scrollMax ${offscreen.after.scrollMax})`, offscreen);

  // Резервният път, когато картата още НЕ може да се измери (тяло с височина 0, както при карта,
  // която браузърът още не е подредил): класът трябва да дойде, щом тялото стане измеримо.
  const late = await page.evaluate(async () => {
    const host = document.getElementById('late-host') || (() => {
      const h = document.createElement('div');
      h.id = 'late-host';
      h.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:99997;display:flex;background:#ddd;padding:8px;';
      document.body.appendChild(h);
      return h;
    })();
    host.innerHTML = '';
    const id = 996001, gdid = 'late' + Date.now();
    const span = { start: 0, end: 1, type: 8, paramstring: '/storage/emulated/0/Pictures/Images/tall.png', paramint: 10 };
    const nt = { alarm_type: -1, boardid: null, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0, gdid, id, notetxt: '*', numord: id, sellist: 0, status: 0, text_span: JSON.stringify(span), title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244 };
    if (Array.isArray(mediaData)) mediaData.push({ noteid: gdid, path: 'photo.jpg', pathGD: 'ID_photo.jpg', type: 1, name: 'photo.jpg' });
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    el.style.display = 'flex';
    el.dataset.probeKey = 'late';
    host.appendChild(el);
    // Тялото е скрито, значи картата не може да се измери - точно случаят, за който е резервата.
    const content = el.querySelector('.note-content');
    content.style.display = 'none';
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const f = el.querySelector('.nm-inline-img');
      if (f && f.dataset.nmState && f.dataset.nmState !== 'loading') break;
      await new Promise(r => setTimeout(r, 40));
    }
    await new Promise(r => requestAnimationFrame(r));
    const fr = () => { const f = el.querySelector('.nm-inline-img'); const b = f ? f.getBoundingClientRect() : null; return b ? Math.round(b.width) : 0; };
    const whileHidden = { w: fr(), clientH: content.clientHeight };
    content.style.display = '';
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 50));
      if (fr() < whileHidden.w) break;
    }
    return { whileHidden, after: { w: fr(), clientH: content.clientHeight, scrollMax: content.scrollHeight - content.clientHeight } };
  });
  ok(late.after.w > 0 && late.after.w < 205,
    `${label}: щом тялото стане измеримо, високата снимка е смалена (${late.after.w}px < 205)`, late);
  ok(late.after.scrollMax === 0,
    `${label}: след смаляването няма скрол (scrollMax ${late.after.scrollMax})`, late);

  // Отворена бележка (модал): нищо не се променя - нито размерът на снимката, нито скролът.
  const modal = await page.evaluate(async () => {
    const mb = document.getElementById('modal-body');
    if (!mb) return null;
    const span = { start: 0, end: 1, type: 8, paramstring: '/storage/emulated/0/Pictures/Images/tall.png', paramint: 10 };
    mb.innerHTML = getFormattedNoteHtml('*', JSON.stringify(span), '', true);
    hydrateInlineImages(mb);
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const f = mb.querySelector('.nm-inline-img');
      if (f && f.dataset.nmState && f.dataset.nmState !== 'loading') break;
      await new Promise(r => setTimeout(r, 40));
    }
    await new Promise(r => requestAnimationFrame(r));
    const f = mb.querySelector('.nm-inline-img');
    const r = f ? f.getBoundingClientRect() : null;
    return {
      w: r ? Math.round(r.width) : null, h: r ? Math.round(r.height) : null,
      overflowY: getComputedStyle(mb).overflowY,
      modalScrollCls: mb.classList.contains('note-body-scroll'),
      cardClsAnywhere: !!document.querySelector('.note-body-scroll #modal-body'),
    };
  });
  ok(!!modal, `${label}: модалът е намерен`, modal);
  if (modal) {
    // В модала ширината е процент от снимката с таван колоната на бележката (там тя е по-широка от
    // картата). Важното е, че височината е пълната - 1600x2200 значи h = w * 1.375, нищо не се
    // смалява по височина и класът за скрол не стига до отворената бележка.
    const expectH = modal.w ? Math.round(modal.w * 2200 / 1600) : 0;
    ok(modal.w > 205 && Math.abs(modal.h - expectH) <= 2,
      `${label}: в отворена бележка снимката е с пълната височина, не се смалява (${modal.w}x${modal.h}, очаквано ${expectH})`, modal);
    ok(!modal.modalScrollCls, `${label}: модалът не получава класа за скрол на картата`, modal);
    ok(!modal.cardClsAnywhere, `${label}: класът .note-body-scroll не стига до отворената бележка`, modal);
  }

  if (errs.length) console.log('pageerrors: ' + JSON.stringify(errs.slice(0, 5)));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/big-inline-${viewport.width}.png` });
  await ctx.close();
  return out;
}

await run({ width: 390, height: 844 }, 'phone', true);
await run({ width: 1280, height: 900 }, 'wide', false);
await browser.close();
await new Promise(r => srv.close(r));
console.log(`\n${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
