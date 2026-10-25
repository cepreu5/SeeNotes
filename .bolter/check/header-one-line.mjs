// Едноредов хедър (23.10.2026, искане на собственика):
//   „в landscape режим на мобилни хедърът на приложението се пренася на три реда... хедърът да
//    остава на един ред, ако полето за търсене може да се свие и пак да има място поне за 20
//    символа... полето се свива до 20ch, преди хедърът да мине на втори ред... засичането да е
//    по ширината на хедъра (container query), не по ширината на екрана."
//
// Уточненията от собственика, които този тест пази:
//   1) БЕЗ overflow меню — нито един бутон на хедъра не се мести и не се крие, на всяка ширина;
//   2) БЕЗ рязане на заглавието — текстът му винаги се чете целият (никакво text-overflow:
//      ellipsis, никакво overflow: hidden върху него);
//   3) ДВЕ СЪСТОЯНИЯ, никога две: ЕДИН ред (лого+заглавие | търсене | бутони) или ТРИ реда
//      (лого+заглавие / всички бутони / търсене в пълна ширина). Няма двуредово състояние и
//      layout-ът не минава през него.
//
// Механизъм (затова проверките изглеждат така):
//   header { flex-wrap: wrap; container-type: inline-size; container-name: app-header }
//   #header-content { display: flex; flex-wrap: nowrap }        <- един ред
//   @container app-header (max-width: 799px) { #header-content { display: grid; 3 rows } }
//   #search-wrapper { flex: 1 1 calc(20ch + <подложка>); min-width: същото }
//   #search-box { min-width: calc(20ch + var(--hdr-search-pad)) }
//   -> редът се свива до долната граница на полето (20ch ИЗПОЛЗУЕМ текст) и чак когато и тя не
//      се побира, редът става три реда. Container query не може да стилизира собствения си
//      контейнер, затова контейнерът е <header>, а превключва #header-content вътре в него.
//
// Пуска се от корена на хранилището:
//   node .bolter/check/header-one-line.mjs
//   BASE=<commit> node .bolter/check/header-one-line.mjs   (сервира style.css и html от онзи
//                                                           комит — за снимките „преди")
import { chromium } from '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile, access } from 'node:fs/promises'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(process.env.ROOT || 'uni');
const BASE = process.env.BASE || '';
// cx-notes: index.html е приложението; main: index-2.html (index.html там е само splash).
const appFile = process.env.APP || (await access(path.join(root, 'index-2.html')).then(() => true).catch(() => false) ? 'index-2.html' : 'index.html');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const fromBase = (rel) => execFileSync('git', ['show', `${BASE}:uni/${rel}`], { maxBuffer: 64 << 20 });

const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? appFile : p.replace(/^\//, '');
  try {
    const b = BASE && (rel === appFile || rel === 'style.css') ? fromBase(rel) : await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
  if (!cond) fails++;
};

// ---------- 1. Статични проверки върху style.css (без браузър) ----------
const css = BASE ? fromBase('style.css').toString() : await readFile(path.join(root, 'style.css'), 'utf8');
const html = BASE ? fromBase(appFile).toString() : await readFile(path.join(root, appFile), 'utf8');

const blockOf = (selector) => {
  const m = css.match(new RegExp('(?:^|\\n)' + selector.replace(/[#.>]/g, (c) => '\\' + c) + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
};
const headerBlock = blockOf('header');
ok(/container-type:\s*inline-size/.test(headerBlock), 'style.css: header има container-type: inline-size', headerBlock.slice(0, 120));
ok(/container-name:\s*app-header/.test(headerBlock), 'style.css: header има container-name: app-header');
ok(/flex-wrap:\s*wrap/.test(headerBlock), 'style.css: header е flex-wrap: wrap (панелът с дъските е отделна лента)');
ok(/flex-wrap:\s*nowrap/.test(blockOf('#header-content')), 'style.css: #header-content (редът) е flex-wrap: nowrap — не се пренася на два реда');
ok(/@container\s+app-header\s*\(max-width/.test(css), 'style.css: има поне едно @container app-header (max-width: …)');
const containerBlocks = [...css.matchAll(/@container\s+app-header\s*\(max-width:\s*\d+px\)\s*\{([\s\S]*?)\n\}/g)].map(m => m[1]);
ok(containerBlocks.some(b => /display:\s*grid/.test(b) && /grid-template-rows:\s*auto\s+auto\s+auto/.test(b)), 'style.css: един @container праг превключва реда на grid с ТРИ реда (auto auto auto)');
ok(!/@media[^{]*max-width[^{]*\{[^}]*header\s*\{[^}]*flex-direction/.test(css), 'style.css: няма @media по ширина на екрана, който да подрежда хедъра (това е работа на @container)');
ok(!/#header-overflow/.test(css) && !/#header-overflow/.test(html), 'няма overflow меню в хедъра (уточнение на собственика: всички бутони остават в реда)');
const titleRules = [...css.matchAll(/(^|\n)([^\n{}]*header h1[^\n{}]*|#app-title[^\n{}]*)\{([^}]*)\}/g)].map(m => m[3]).join('\n');
ok(!/text-overflow:\s*ellipsis/.test(titleRules), 'заглавието на хедъра не се реже с многоточие', titleRules.slice(0, 200));
ok(!/overflow:\s*hidden/.test(titleRules), 'заглавието на хедъра не е с overflow: hidden');
const swBlock = blockOf('#search-wrapper');
ok(/flex:\s*1\s+1\s+calc\(\s*20ch\s*\+/.test(swBlock), '#search-wrapper: flex-basis е 20ch + подложка (полето се брои в реда с долната си граница)', swBlock.slice(0, 160));
ok(/min-width:\s*calc\(\s*20ch\s*\+/.test(swBlock), '#search-wrapper: min-width е 20ch + подложка');
ok(/min-width:\s*calc\(\s*20ch\s*\+/.test(blockOf('#search-box')), '#search-box: min-width е 20ch + собствената подложка (20ch ИЗПОЛЗУЕМ текст)');

// Бутоните, които ТРЯБВА да се виждат: тези от #header-buttons в HTML, които не са скрити още в
// разметката (install_button е display:none, докато приложението не го покаже). Така проверката
// хваща и случай, в който някое CSS правило скрие бутон.
const requiredButtons = (() => {
  const i = html.indexOf('id="header-buttons"');
  if (i < 0) return [];
  const from = html.lastIndexOf('<', i);
  const block = html.slice(from, html.indexOf('</header>', i));
  const ids = [];
  for (const m of block.matchAll(/<(button|div)\s+id="([A-Za-z0-9_-]+)"[^>]*>/g)) {
    if (/display:\s*none/.test(m[0])) continue;
    ids.push(m[2]);
  }
  return ids.filter(id => id !== 'boards-menu-container' && id !== 'header-buttons');
})();
console.log('бутони, които трябва да се виждат:', requiredButtons.join(', '));

// ---------- 2. Живият хедър в истински браузър ----------
const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', locale: 'bg-BG' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const q = new URL(url).searchParams.get('q') || '';
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    if (/vnd\.google-apps\.folder/.test(q)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
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
      drive: { files: { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: {} }); } } },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
  localStorage.setItem('language', 'bg');
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
// 'kofiWidgetOverlay is not defined' идва от самия тест: скриптът на Ko-fi от CDN е подменен с
// празен отговор в маршрутизацията по-долу. Грешката е същата и на изходния комит (проверено с
// BASE=<branch point>), значи не е от тази промяна.
const IGNORE_CONSOLE = /^(Failed to load resource|kofiWidgetOverlay is not defined)/;
page.on('console', m => { if (m.type() === 'error' && !IGNORE_CONSOLE.test(m.text())) errs.push(String(m.text()).slice(0, 200)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function');
await page.evaluate(() => { if (typeof contentModal !== 'undefined' && !contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 20000 }).catch(() => { });
await page.waitForTimeout(1500);

// Мери хедъра както го вижда собственикът: колко РЕДА са децата на реда (1 или 3, никога 2),
// побира ли се 20ch текст, видим ли е всеки бутон, чете ли се заглавието изцяло, има ли
// хоризонтално преливане. Ред = вертикална лента: децата, които се застъпват вертикално, са на
// един ред.
const measure = () => page.evaluate(() => {
  const header = document.querySelector('header');
  if (!header) return { missing: true };
  const row = document.getElementById('header-content') || header; // BASE= (стар комит) няма опаковка
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), right: +b.right.toFixed(1), left: +b.left.toFixed(1) }; };
  const shown = (el) => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  const hcs = getComputedStyle(header);
  const hb = box(header);
  const padT = parseFloat(hcs.paddingTop), padB = parseFloat(hcs.paddingBottom);
  const contentLeft = hb.left + parseFloat(hcs.paddingLeft), contentRight = hb.right - parseFloat(hcs.paddingRight);

  const kids = [...row.children].filter(el => shown(el)).map(el => ({ id: el.id || String(el.className), ...box(el) }));
  // Вертикални ленти (редове): застъпващите се деца са на един ред.
  const bands = [];
  for (const k of [...kids].sort((a, b) => a.top - b.top)) {
    const last = bands[bands.length - 1];
    if (last && k.top < last.bottom - 0.5) { last.bottom = Math.max(last.bottom, k.bottom); last.ids.push(k.id); }
    else bands.push({ top: k.top, bottom: k.bottom, h: 0, ids: [k.id] });
  }
  for (const b of bands) b.h = +(b.bottom - b.top).toFixed(1);
  const rowGap = parseFloat(getComputedStyle(row).rowGap) || 0;
  // Очаквана височина на реда при 1 ред (най-високото дете) и при 3 реда (сборът на лентите +
  // двата реда разстояние между тях).
  const oneRowH = Math.max(...kids.map(k => k.h)) + padT + padB;
  const threeRowH = bands.reduce((s, b) => s + b.h, 0) + rowGap * (bands.length - 1) + padT + padB;

  const sb = document.getElementById('search-box');
  const sbcs = sb && getComputedStyle(sb);
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + (sbcs ? sbcs.font : '16px sans-serif');
  probe.textContent = '0'.repeat(20);
  document.body.appendChild(probe);
  const ch20 = probe.getBoundingClientRect().width;
  probe.remove();
  const padLs = sbcs ? parseFloat(sbcs.paddingLeft) : 0, padRs = sbcs ? parseFloat(sbcs.paddingRight) : 0;
  const swcs = document.getElementById('search-wrapper') ? getComputedStyle(document.getElementById('search-wrapper')) : null;

  const title = document.getElementById('app-title');
  const tcs = title && getComputedStyle(title);

  const btns = document.getElementById('header-buttons');
  const buttons = btns ? [...btns.children].filter(el => el.id !== 'boards-menu-container').map(el => {
    const b = el.getBoundingClientRect();
    return {
      id: el.id || String(el.className).slice(0, 20),
      visible: shown(el),
      inside: b.width > 0 && b.left >= contentLeft - 1 && b.right <= contentRight + 1 && b.top >= hb.top - 1 && b.bottom <= hb.bottom + 1,
      ...box(el),
    };
  }) : [];

  return {
    rowDisplay: getComputedStyle(row).display,
    header: { ...hb, clientH: header.clientHeight, clientW: header.clientWidth, scrollW: header.scrollWidth, wrap: hcs.flexWrap, containerType: hcs.containerType, containerName: hcs.containerName },
    padT, padB, contentLeft: +contentLeft.toFixed(1), contentRight: +contentRight.toFixed(1),
    kids, bands, rowGap, oneRowH: +oneRowH.toFixed(1), threeRowH: +threeRowH.toFixed(1),
    search: { clientW: sb ? sb.clientWidth : -1, textW: sb ? +(sb.clientWidth - padLs - padRs).toFixed(1) : -1, ch20: +ch20.toFixed(1), padL: padLs, padR: padRs, minW: sbcs ? sbcs.minWidth : null, wrapperMinW: swcs ? swcs.minWidth : null, wrapperFlexBasis: swcs ? swcs.flexBasis : null },
    title: title ? { text: title.textContent.trim(), ...box(title), scrollW: title.scrollWidth, clientW: title.clientWidth, textOverflow: tcs.textOverflow, display: tcs.display, fontSize: tcs.fontSize } : null,
    buttons,
    pageOverflow: { docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth },
    headerOverflow: Math.max(...kids.map(k => k.right)) > contentRight + 0.5 || header.scrollWidth > header.clientWidth,
  };
});

const setSize = async (w, h) => { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(450); };
const shot = async (w, h, name) => { await setSize(w, h); await page.screenshot({ path: path.join('.bolter', 'check', name) }); };

const commonChecks = (label, m) => {
  ok(!m.missing, `${label}: хедърът съществува`);
  if (m.missing) return;
  ok(m.title && m.title.display !== 'none' && m.title.clientW > 0, `${label}: заглавието #app-title е видимо с ненулева ширина`, m.title && { w: m.title.w, disp: m.title.display });
  ok(m.title && m.title.scrollW <= m.title.clientW + 1, `${label}: заглавието се чете изцяло (scrollWidth <= clientWidth + 1, без многоточие)`, m.title && { scrollW: m.title.scrollW, clientW: m.title.clientW, textOverflow: m.title.textOverflow });
  const byId = new Map(m.buttons.map(b => [b.id, b]));
  const missing = requiredButtons.filter(id => { const b = byId.get(id); return !b || !b.visible; });
  ok(missing.length === 0, `${label}: всеки бутон на хедъра е видим (${requiredButtons.length}: ${requiredButtons.join(', ')})`, missing);
  const outside = requiredButtons.map(id => byId.get(id)).filter(b => b && !b.inside);
  ok(outside.length === 0, `${label}: всеки бутон е вътре в хедъра, без да излиза извън него`, outside.map(b => ({ id: b.id, right: b.right, limit: m.contentRight })));
  ok(m.search.textW >= m.search.ch20 - 0.5, `${label}: полето за търсене пази >= 20ch използваем текст`, { textW: m.search.textW, ch20: m.search.ch20 });
  ok(m.header.scrollW <= m.header.clientW, `${label}: хедърът не се скролва хоризонтално`, { scrollW: m.header.scrollW, clientW: m.header.clientW });
  ok(m.pageOverflow.docScrollW <= m.pageOverflow.innerW, `${label}: страницата не прелива хоризонтално`, m.pageOverflow);
  const basis = parseFloat(m.search.wrapperFlexBasis), minW = parseFloat(m.search.wrapperMinW);
  const floor = m.search.ch20 + m.search.padL + m.search.padR;
  ok(Math.abs(basis - minW) <= 0.5 && Math.abs(basis - floor) <= 2,
    `${label}: flex-basis на #search-wrapper е точно 20ch + подложката (полето се брои в реда с долната си граница)`,
    { basis, minW, floor: +floor.toFixed(1) });
  // Височината на хедъра отговаря точно на броя редове — нищо не се подрежда между тях.
  const expected = m.bands.length === 1 ? m.oneRowH : m.threeRowH;
  ok(Math.abs(m.header.clientH - expected) <= 2, `${label}: височината на хедъра отговаря на ${m.bands.length} ред(а) (няма скрит междинен ред)`, { clientH: m.header.clientH, expected });
};

// --- 844x390: телефон в landscape (оплакването на собственика) — ЕДИН ред ---
await shot(844, 390, `header-one-line-844x390${BASE ? '-before' : ''}.png`);
let m = await measure();
console.log(`\n--- 844x390 (landscape) --- редове=${m.bands.length} (${m.rowDisplay}) h=${m.header.clientH} (1 ред ≈ ${m.oneRowH}, 3 реда ≈ ${m.threeRowH}) | 20ch=${m.search.ch20} текст=${m.search.textW} | заглавие ${m.title.scrollW}/${m.title.clientW} | бутони ${m.buttons.length}`);
ok(m.bands.length === 1, '844x390: хедърът е ЕДИН ред (не два и не три)', m.bands.map(b => b.ids.join('+')));
ok(m.bands.length !== 2, '844x390: няма двуредово състояние', { bands: m.bands.length });
commonChecks('844x390', m);

// --- 390x844: телефон в портрет — ТРИ реда (марка / бутони / търсене) ---
await shot(390, 844, `header-one-line-390x844${BASE ? '-before' : ''}.png`);
m = await measure();
console.log(`\n--- 390x844 (portrait) --- редове=${m.bands.length} (${m.rowDisplay}) h=${m.header.clientH} (1 ред ≈ ${m.oneRowH}, 3 реда ≈ ${m.threeRowH}) | 20ch=${m.search.ch20} текст=${m.search.textW} | заглавие ${m.title.scrollW}/${m.title.clientW} | бутони ${m.buttons.length}`);
ok(m.bands.length === 3, '390x844: хедърът е ТРИ реда (не два)', m.bands.map(b => b.ids.join('+')));
ok(m.bands.length === 3 && /^$|header-buttons/.test(m.bands[1].ids.join(',')), '390x844: ред 2 са бутоните (ред 1 е логото+заглавието)', m.bands.map(b => b.ids.join('+')));
ok(m.bands.length === 3 && m.bands[2].ids.join(',').includes('search-wrapper'), '390x844: ред 3 е полето за търсене', m.bands.map(b => b.ids.join('+')));
ok(m.bands.length === 3 && Math.abs(m.bands[2].h - 40) <= 2, '390x844: полето за търсене е самостоятелен ред с нормалната си височина', m.bands.map(b => ({ ids: b.ids, h: b.h })));
commonChecks('390x844', m);

// --- 1280x800: десктоп — ЕДИН ред ---
await setSize(1280, 800);
m = await measure();
console.log(`\n--- 1280x800 --- редове=${m.bands.length} (${m.rowDisplay}) h=${m.header.clientH} (1 ред ≈ ${m.oneRowH}) | 20ch=${m.search.ch20} текст=${m.search.textW} | заглавие ${m.title.scrollW}/${m.title.clientW} | бутони ${m.buttons.length}`);
ok(m.bands.length === 1, '1280x800: хедърът е ЕДИН ред', m.bands.map(b => b.ids.join('+')));
commonChecks('1280x800', m);
const domButtons = await page.evaluate(() => {
  const b = document.getElementById('header-buttons');
  return b ? [...b.children].map(el => el.id || String(el.className).slice(0, 20)).filter(id => id !== 'boards-menu-container') : [];
});
ok(domButtons.filter(id => requiredButtons.includes(id)).join(',') === requiredButtons.join(','), '1280x800: бутоните са в реда и в първоначалния си DOM ред', { domButtons, requiredButtons });

// --- Никога два реда: преминаване през ширини. Всяка ширина трябва да е 1 или 3 реда, а
//     височината на хедъра да отговаря точно на този брой редове. ---
console.log('\n--- преминаване през ширини (никога два реда) ---');
const sweep = [];
for (const w of [320, 360, 390, 430, 480, 600, 700, 760, 790, 800, 820, 830, 844, 900, 1024, 1150, 1280]) {
  await setSize(w, 500);
  const r = await measure();
  sweep.push({ w, bands: r.bands.length, clientH: r.header.clientH, one: r.oneRowH, three: r.threeRowH, search: r.search.textW, ch20: r.search.ch20, disp: r.rowDisplay, titleReadable: r.title.scrollW <= r.title.clientW + 1, headerOverflow: r.headerOverflow, buttonsVisible: r.buttons.filter(b => b.visible).length });
  console.log(`  ${String(w).padStart(4)}px: ${r.bands.length} ред(а) [${r.rowDisplay}] h=${r.header.clientH} (1 ред ${r.oneRowH} / 3 реда ${r.threeRowH}) търсене ${r.search.textW}/${r.search.ch20} заглавие ${r.title.scrollW <= r.title.clientW + 1 ? 'цялото' : 'ОТРЯЗАНО'} бутони ${r.buttons.filter(b => b.visible).length}`);
}
const twoRow = sweep.filter(s => s.bands !== 1 && s.bands !== 3);
ok(twoRow.length === 0, 'на нито една ширина хедърът не е на два реда (само 1 или 3)', twoRow);
const badHeight = sweep.filter(s => Math.abs(s.clientH - (s.bands === 1 ? s.one : s.three)) > 2);
ok(badHeight.length === 0, 'на всяка ширина височината на хедъра отговаря точно на 1 или 3 реда', badHeight);
const noFloor = sweep.filter(s => s.search < s.ch20 - 0.5);
ok(noFloor.length === 0, 'на всяка ширина полето пази >= 20ch изпълним текст', noFloor);
const clipped = sweep.filter(s => !s.titleReadable);
ok(clipped.length === 0, 'на всяка ширина заглавието се чете изцяло (не се реже)', clipped);
// Преливането се гледа върху ХЕДЪРА, не върху цялата страница: на 320px друг, несвързан с тази
// промяна панел (помощникът, .kb-*) излиза извън екрана и вдига document.scrollWidth. За
// страницата проверката важи на трите задължителни размера (горе, в commonChecks).
const overflow = sweep.filter(s => s.headerOverflow);
ok(overflow.length === 0, 'на нито една ширина хедърът не прелива хоризонтално', overflow);
const hidden = sweep.filter(s => s.buttonsVisible !== requiredButtons.length);
ok(hidden.length === 0, `на всяка ширина се виждат всичките ${requiredButtons.length} бутона`, hidden);

// --- Пълноекранният режим не се е счупил: скрива всичко освто търсачката ---
await page.evaluate(() => { localStorage.setItem('extendedMode', 'true'); });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function');
await page.evaluate(() => { if (typeof contentModal !== 'undefined' && !contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 20000 }).catch(() => { });
await page.waitForTimeout(1200);
const fs = await page.evaluate(() => {
  const header = document.querySelector('header');
  const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display !== 'none' && b.width > 0 && b.height > 0; };
  return {
    fullscreen: header.classList.contains('header-fullscreen'),
    searchShown: shown(document.getElementById('search-wrapper')),
    buttonsShown: shown(document.getElementById('header-buttons')),
    titleShown: shown(document.getElementById('app-title')),
    h: header.getBoundingClientRect().height,
  };
});
ok(fs.fullscreen && fs.searchShown, 'пълноекранен режим: хедърът е в режим и търсачката се вижда', fs);
ok(!fs.buttonsShown && !fs.titleShown, 'пълноекранен режим: бутоните и заглавието са скрити, както досега', fs);
await page.evaluate(() => { localStorage.setItem('extendedMode', 'false'); });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function');
await page.evaluate(() => { if (typeof contentModal !== 'undefined' && !contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 20000 }).catch(() => { });
await page.waitForTimeout(1000);

ok(errs.length === 0, 'конзолата е чиста', errs.slice(0, 5));

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} ПРОВАЛЕНИ` : ''));
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
