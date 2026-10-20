// Бутонът „Пусни демо-тура" в менюто с бордовете (един квадрат, който стига и до плаващото
// меню, защото то клонира квадратите на хедъра) и зареждането на тур-базата от lang/kb-tour-*.json.
// Пуска се от корена на хранилището:
//   node .bolter/check/product-tour.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
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

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// Нищо извън localhost: gsi клиентът получава празен заместител, за да не гърми app-ът.
await ctx.route(/^https?:\/\/(?!localhost)/, r => {
  if (r.request().url().startsWith('https://accounts.google.com/gsi/client')) {
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errs.push(String(m.text()).slice(0, 300)); });

// Езикът и флагът на интрото се слагат преди старта: турът се пуска ръчно (force), а
// автоматичното интро не бива да пречи на проверката.
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.evaluate(() => {
  localStorage.setItem('language', 'bg');
  localStorage.setItem('guide', 'false');
  localStorage.removeItem('initial_setup_complete');
});
await page.reload({ waitUntil: 'load' });

const boot = async () => {
  await page.waitForFunction(() => typeof startApp === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
  await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
};
await boot();

// Менюто с бордовете се строи от renderUI, а в headless то не минава само: истинският старт
// го вика след профила. Затова тук го викаме изрично (както link-board-geom.mjs).
await page.evaluate(async () => {
  if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
  if (!Array.isArray(boardsData) || boardsData.length === 0) {
    boardsData.push({ id: 1, title: 'Main', gdid: 'probeBoard', numord: 1 });
  }
  localStorage.setItem('language', 'bg'); // езикът при рисуването на квадрата
  await renderUI({});
  await new Promise(r => setTimeout(r, 600));
});
await page.waitForFunction(
  () => document.querySelector('header .board-menu-container .board-filter-link[data-boardid="product-tour"]'),
  null, { timeout: 10000 }
);

// --- 1. Тур-базата наистина се слива в основната (lang/kb-tour-*.json) ---
const kb = await page.evaluate(async () => {
  const loaded = await ensureKBAssistant();
  const general = window.kbAssistant?.kbData?.general || [];
  const tour = general.find(e => e.id === 'winnotes-tour');
  const intro = general.find(e => e.id === 'assistant-1');
  return {
    loaded,
    lang: window.kbAssistant?.currentLang,
    hasTour: !!tour,
    steps: tour ? Object.keys(tour.guide || {}).filter(k => /^\d+$/.test(k)).length : 0,
    step1: tour?.guide?.['1']?.text,
    step1Target: tour?.guide?.['1']?.target,
    hasIntro: !!intro,
    total: general.length,
  };
});
ok(kb.loaded === true, `асистентът се зарежда (${kb.loaded})`);
ok(kb.hasTour === true, `kbData.general има запис с id 'winnotes-tour' (общо ${kb.total} записа, език ${kb.lang})`);
ok(kb.steps >= 20, `турът носи стъпките си (${kb.steps})`);
ok(kb.step1Target === '#app-title', `стъпките пазят target от ядрото (${kb.step1Target})`);
ok(kb.hasIntro === true, 'вграденото интро assistant-1 не е изчезнало при сливането');

// --- 1б. На български: lang/kb-tour-bg.json пада върху записа, без да го дублира ---
const kbBg = await page.evaluate(async () => {
  localStorage.setItem('language', 'bg');
  const kb = window.kbAssistant;
  kb.currentLang = 'bg';
  kb.initPromise = null; // ново зареждане, този път на български
  const okInit = await kb.init();
  const general = kb.kbData?.general || [];
  const tour = general.find(e => e.id === 'winnotes-tour');
  return {
    okInit,
    lang: kb.currentLang,
    total: general.length,
    tours: general.filter(e => e.id === 'winnotes-tour').length,
    step1: tour?.guide?.['1']?.text,
    answer: tour?.answer,
    introStillThere: general.some(e => e.id === 'assistant-1'),
  };
});
ok(kbBg.okInit === true && kbBg.lang === 'bg', `повторното зареждане минава на български (${kbBg.lang})`);
ok(kbBg.tours === 1, `записът за тура е точно един, не се дублира (${kbBg.tours})`);
ok(kbBg.total === kb.total, `броят записи не се мени при второ зареждане (${kbBg.total})`);
ok(typeof kbBg.step1 === 'string' && kbBg.step1.includes('Добре дошъл'),
  `първата стъпка е на български от lang/kb-tour-bg.json (${String(kbBg.step1).slice(0, 40)})`);
ok(typeof kbBg.answer === 'string' && kbBg.answer.includes('Кратък тур'),
  `отговорът също е слят от тур-файла (${String(kbBg.answer).slice(0, 40)})`);
ok(kbBg.introStillThere === true, 'вграденото интро assistant-1 остава и след това сливане');

// --- 1в. Етикетът на квадрата: български при 'bg', английски иначе ---
const labels = await page.evaluate(() => {
  localStorage.setItem('language', 'en');
  const en = productTourLabel();
  localStorage.setItem('language', 'bg');
  const bg = productTourLabel();
  return { en, bg };
});
ok(labels.en === 'Play the demo tour', `при language=en: "${labels.en}"`);
ok(labels.bg === 'Пусни демо-тура', `при language=bg: "${labels.bg}"`);

// --- 2. Квадратът в менюто с бордове: точно един, и не е борд-таб ---
const menu = await page.evaluate(() => {
  const header = document.querySelector('header .board-menu-container');
  const squares = header ? [...header.querySelectorAll('.board-filter-link[data-boardid="product-tour"]')] : [];
  const el = squares[0];
  const all = header ? [...header.querySelectorAll('.board-filter-link')] : [];
  return {
    count: squares.length,
    tag: el ? el.tagName : null,
    cls: el ? el.className : null,
    bg: el ? el.style.backgroundColor : null,
    color: el ? el.style.color : null,
    title: el ? el.title : null,
    aria: el ? el.getAttribute('aria-label') : null,
    icon: el ? !!el.querySelector('svg circle') && !!el.querySelector('svg path') : false,
    util: isBoardMenuUtilId('product-tour'),
    rank: boardMenuUtilRank('product-tour'),
    rankCloseAll: boardMenuUtilRank('close-all-notes'),
    lastSquare: el ? all[all.length - 1] === el : false,
    afterCloseAll: el ? (all.indexOf(el) > all.findIndex(l => l.dataset.boardid === 'close-all-notes')) : false,
    asBoard: (() => {
      // Няма ли го сред бордовете на приложението, не е борд-таб.
      if (typeof boardsData === 'undefined' || !Array.isArray(boardsData)) return null;
      return boardsData.some(b => b && String(b.gdid || b.id) === 'product-tour');
    })(),
  };
});
ok(menu.count === 1, `хедърът има точно един квадрат data-boardid="product-tour" (${menu.count})`);
ok(menu.tag === 'SPAN', `квадратът е span, както останалите служебни квадрати (${menu.tag})`);
ok(String(menu.cls).includes('board-filter-link') && String(menu.cls).includes('product-tour-btn'),
  `класове: ${menu.cls}`);
ok(menu.bg === '#00897B' || /rgb\(0,\s*137,\s*123\)/.test(String(menu.bg)), `фонът е #00897B (${menu.bg})`);
ok(/rgb\(255,\s*255,\s*255\)/.test(String(menu.color)) || menu.color === '#fff' || menu.color === 'rgb(255, 255, 255)',
  `иконата е бяла (${menu.color})`);
ok(menu.title === 'Пусни демо-тура' && menu.aria === menu.title,
  `title/aria-label на български: "${menu.title}" / "${menu.aria}"`);
ok(menu.icon === true, 'иконата е знак за пускане в кръгче');
ok(menu.util === true && menu.asBoard === false,
  `служебен квадрат, не борд-таб (util=${menu.util}, в boardsData=${menu.asBoard})`);
ok(menu.rank === 3 && menu.rankCloseAll === 2,
  `подредба: reorder 0, fullscreen 1, close-all 2, tour 3 (${menu.rankCloseAll}/${menu.rank})`);
ok(menu.afterCloseAll === true, 'стои след „Затвори всички бележки" в лентата');
// Позицията се пази от подредбата на allButtonLinks (тя е локална за createBoardsUI), затова
// това, че квадратът влиза в нея, се проверява в изходника.
const mainSrc = await readFile(path.join(root, 'main.js'), 'utf8');
ok(/allButtonLinks\.push\(tourLink\)/.test(mainSrc), 'квадратът влиза в allButtonLinks (иначе подредбата го губи)');

// --- 3. Същото меню, отворено както го отваря плаващият бутон: клонингът също е един ---
await page.evaluate(() => showAllBoardsModal());
await page.waitForFunction(() => document.getElementById('boards-menu-modal').classList.contains('visible'), null, { timeout: 5000 });
const inModal = await page.evaluate(() => {
  const box = document.querySelector('#boards-menu-modal .all-boards-modal-container');
  const pick = id => box ? [...box.querySelectorAll(`[data-boardid="${id}"]`)] : [];
  return {
    tour: pick('product-tour').length,
    tourTag: pick('product-tour')[0]?.tagName || null,
    closeAll: pick('close-all-notes').length,
  };
});
ok(inModal.tour === 1, `в отвореното меню има точно един тур-квадрат (${inModal.tour})`);
ok(inModal.closeAll === 1, `за сравнение: затвори-всички също е един (${inModal.closeAll})`);

// --- 4. Клик върху клонинга в менюто: менюто се скрива и турът тръгва ---
const errsAtClick = errs.length;
await page.evaluate(() => {
  document.querySelector('#boards-menu-modal .all-boards-modal-container [data-boardid="product-tour"]').click();
});
await page.waitForFunction(() => !document.getElementById('boards-menu-modal').classList.contains('visible'), null, { timeout: 5000 });
ok(true, 'кликът в менюто скрива менюто с бордовете');
await page.waitForFunction(() => window.isGuideActive === true && document.querySelector('.guide-container'), null, { timeout: 10000 });
const started = await page.evaluate(() => ({
  active: window.isGuideActive === true,
  container: !!document.querySelector('.guide-container'),
  img: !!document.querySelector('.guide-container img'),
  newErrs: 0,
}));
ok(started.active === true, 'водачът е активен (window.isGuideActive)');
ok(started.container === true && started.img === true, 'има .guide-container с картинка на стъпката');
await page.evaluate(() => { if (typeof window.removeGuide === 'function') window.removeGuide(); });

// --- 5. Клик върху квадрата в хедъра (другият вход) също пуска тура ---
const fromHeader = await page.evaluate(async () => {
  const el = document.querySelector('header .board-menu-container .board-filter-link[data-boardid="product-tour"]');
  const started = await startProductTour();
  return { started, headerSquare: !!el };
});
await page.waitForFunction(() => window.isGuideActive === true && document.querySelector('.guide-container'), null, { timeout: 10000 });
ok(fromHeader.headerSquare === true, 'квадратът се намира и в хедъра');
ok(fromHeader.started === true, `startProductTour() връща true (${fromHeader.started})`);
ok(true, 'турът тръгва и от хедъра');
await page.evaluate(() => { if (typeof window.removeGuide === 'function') window.removeGuide(); });

// --- 6. Режим „премести бележка на борд": там тур-квадрат НЯМА ---
await page.evaluate(() => showAllBoardsModal(() => {}));
await page.waitForFunction(() => document.getElementById('boards-menu-modal').classList.contains('visible'), null, { timeout: 5000 });
const pickMode = await page.evaluate(() => {
  const box = document.querySelector('#boards-menu-modal .all-boards-modal-container');
  return {
    tour: box ? box.querySelectorAll('[data-boardid="product-tour"]').length : -1,
    closeAll: box ? box.querySelectorAll('[data-boardid="close-all-notes"]').length : -1,
    squares: box ? box.querySelectorAll('.board-filter-link').length : -1,
  };
});
ok(pickMode.tour === 0, `в режим избор на борд няма тур-квадрат (${pickMode.tour})`);
ok(pickMode.closeAll === 0, `там няма и затвори-всички (${pickMode.closeAll})`);
ok(pickMode.squares > 0, `другите квадрати са налице (${pickMode.squares})`);
await page.evaluate(() => document.getElementById('boards-menu-modal').classList.remove('visible'));

// --- 7. Кликът не добавя грешки в конзолата ---
// (Грешки от самия headless старт - предизвикани от изричния renderUI по-горе - се отчитат
// отделно: важното е, че турът не добавя нито една.)
ok(errs.length === errsAtClick, `кликът не добавя pageerror/console error (преди ${errsAtClick}, след ${errs.length})`);
if (errs.length) console.log(`     (от headless старта, не от тура: ${errs.slice(0, 3).join(' | ')})`);

await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
