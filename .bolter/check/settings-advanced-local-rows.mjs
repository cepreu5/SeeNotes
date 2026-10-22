// Настройки: „Локална папка“, „Актуализирай“ и „Архив“ живеят в акордеона „Разширени настройки“.
// Преди: те бяха в осиротял .accordion-content (#data-folders) без родител .accordion, а
// .accordion-content е с max-height:0 — редовете и двата бутона за избор на папка бяха
// винаги с нулева височина, тоест недостъпни за клик.
// Пуска се от корена на хранилището:  node .bolter/check/settings-advanced-local-rows.mjs
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

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(/^https?:\/\/(?!localhost)/, r => {
  if (r.request().url().startsWith('https://accounts.google.com/gsi/client')) {
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));

// В headless startApp не минава по setup пътя; викаме createSettingsUI изрично, за да има
// вързани слушатели (акордеонът се връзва там, не в index.html).
const boot = async () => {
  await page.waitForFunction(() => typeof startApp === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
  await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
  await page.evaluate(async () => {
    if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
    if (typeof createSettingsUI === 'function') await createSettingsUI([], false);
  });
  await page.waitForFunction(() => document.getElementById('settings-modal-body')?.dataset.initializedListeners === 'true', null, { timeout: 10000 });
};

const ROWS = ['local-db-wrapper', 'update-local-folder', 'arh-db-wrapper', 'select-folder-btn', 'select-arh-btn'];

// .accordion-content е с max-height:0 и overflow:hidden — децата пазят собствените си размери,
// но са отрязани. Затова „скрит“ значи: средата на елемента не е той при elementFromPoint.
const clippedProbe = (rows) => Object.fromEntries(rows.map(id => {
  const el = document.getElementById(id);
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return [id, !(hit && (hit === el || el.contains(hit)))];
}));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.setItem('showAdvancedSettings', 'true'));
await page.reload({ waitUntil: 'load' });
await boot();

// --- 1. Структура: и петте елемента са в .accordion .accordion-content ---
const struct = await page.evaluate((rows) => {
  const out = {};
  for (const id of rows) {
    const el = document.getElementById(id);
    out[id] = {
      exists: !!el,
      inAccordion: !!(el && el.closest('.accordion .accordion-content')),
      inAdvancedSpan: !!(el && el.closest('#advanced-settings-span')),
      tag: el ? el.tagName.toLowerCase() : null,
    };
  }
  const contents = [...document.querySelectorAll('.accordion-content')];
  out.orphans = contents.filter(c => !c.closest('.accordion')).map(c => c.id || c.className);
  out.accordionCount = document.querySelectorAll('#advanced-settings-span .accordion').length;
  return out;
}, ROWS);

for (const id of ROWS) {
  const s = struct[id];
  ok(s.exists, `#${id} съществува`);
  ok(s.inAccordion, `#${id} е в .accordion .accordion-content`);
  ok(s.inAdvancedSpan, `#${id} е в #advanced-settings-span`);
}
ok(struct.orphans.length === 0, `няма осиротял .accordion-content без родител .accordion (${struct.orphans.join(', ') || 'нула'})`);
ok(struct.accordionCount === 1, `един акордеон в „Разширени настройки“ (${struct.accordionCount})`);

// --- 2. Редът: Локална папка, Актуализирай, Архив преди „Активна папка“ ---
const order = await page.evaluate(() => {
  const content = document.querySelector('#advanced-settings-span .accordion-content');
  const ids = [...content.querySelectorAll(':scope > [id], :scope > div > [id]')].map(e => e.id);
  const flat = [...content.querySelectorAll('[id]')].map(e => e.id);
  return { ids, flat };
});
const pos = id => order.flat.indexOf(id);
ok(pos('local-db-wrapper') > -1 && pos('update-local-folder') > pos('local-db-wrapper') && pos('arh-db-wrapper') > pos('update-local-folder'),
  `редът е Локална папка → Актуализирай → Архив (${pos('local-db-wrapper')}, ${pos('update-local-folder')}, ${pos('arh-db-wrapper')})`);
ok(pos('active-folder-wrapper') > pos('arh-db-wrapper'), `активната папка идва след тях (${pos('arh-db-wrapper')} < ${pos('active-folder-wrapper')})`);

// --- 3. Включени разширени настройки: блокът се вижда, акордеонът е свит ---
await page.evaluate(async () => {
  localStorage.setItem('showAdvancedSettings', 'true');
  document.getElementById('settings-modal').classList.add('visible');
  if (typeof updateAdvancedSettingsVisibility === 'function') await updateAdvancedSettingsVisibility();
});
await page.waitForTimeout(600);
const closed = await page.evaluate((rows) => {
  const span = document.getElementById('advanced-settings-span');
  const acc = span.querySelector('.accordion');
  const header = acc.querySelector('.accordion-header');
  const content = acc.querySelector('.accordion-content');
  return {
    modalVisible: document.getElementById('settings-modal').classList.contains('visible'),
    spanHidden: span.hasAttribute('hidden'),
    active: acc.classList.contains('active'),
    headerH: Math.round(header.getBoundingClientRect().height),
    headerText: header.textContent.replace(/\s+/g, ' ').trim(),
    headerCursor: getComputedStyle(header).cursor,
    contentH: content.getBoundingClientRect().height,
    heights: Object.fromEntries(rows.map(id => [id, document.getElementById(id).getBoundingClientRect().height])),
  };
}, ROWS);
ok(closed.modalVisible, 'модалът е показан');
ok(!closed.spanHidden, 'при включени разширени настройки блокът не е hidden');
ok(closed.headerH > 0, `заглавието на акордеона се вижда (${closed.headerH}px)`);
ok(/Разширени настройки|Advanced Settings/.test(closed.headerText), `заглавието е „Разширени настройки“ (${closed.headerText})`);
ok(closed.headerCursor === 'pointer', `заглавието е кликаемо (cursor ${closed.headerCursor})`);
ok(!closed.active && closed.contentH === 0, `свит по подразбиране: content ${closed.contentH}px`);
const closedClip = await page.evaluate(clippedProbe, ROWS);
ok(ROWS.every(id => closedClip[id]), `свит: редовете са отрязани, не се стига с клик (${JSON.stringify(closedClip)})`);

// --- 4. Клик върху заглавието отваря акордеона и редовете стават видими ---
await page.click('#advanced-settings-span .accordion-header');
await page.waitForTimeout(600);
const opened = await page.evaluate((rows) => {
  const acc = document.querySelector('#advanced-settings-span .accordion');
  const content = acc.querySelector('.accordion-content');
  const modalBox = document.getElementById('settings-modal-body').getBoundingClientRect();
  return {
    active: acc.classList.contains('active'),
    contentH: Math.round(content.getBoundingClientRect().height),
    maxHeight: content.style.maxHeight,
    arrow: getComputedStyle(acc.querySelector('.accordion-arrow')).transform,
    heights: Object.fromEntries(rows.map(id => [id, Math.round(document.getElementById(id).getBoundingClientRect().height)])),
    widths: Object.fromEntries(rows.map(id => [id, Math.round(document.getElementById(id).getBoundingClientRect().width)])),
    insideModal: Object.fromEntries(rows.map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return [id, r.left >= modalBox.left - 1 && r.right <= modalBox.right + 1];
    })),
  };
}, ROWS);
ok(opened.active, 'след клик акордеонът е активен');
ok(opened.contentH > 100, `след клик съдържанието е отворено (${opened.contentH}px)`);
ok(!!opened.maxHeight && opened.maxHeight !== '0px', `max-height е зададен (${opened.maxHeight})`);
ok(opened.arrow === 'none' || opened.arrow !== '', `стрелката има transform (${opened.arrow})`);
for (const id of ROWS) {
  ok(opened.heights[id] > 10, `#${id} е видим след отваряне (${opened.heights[id]}px)`);
  ok(opened.insideModal[id], `#${id} е в рамките на тялото на модала`);
}
ok(opened.widths['select-folder-btn'] > 40 && opened.widths['select-arh-btn'] > 40,
  `двата бутона имат ширина (${opened.widths['select-folder-btn']}, ${opened.widths['select-arh-btn']})`);

// --- 5. Втори клик затваря ---
await page.click('#advanced-settings-span .accordion-header');
await page.waitForTimeout(600);
const reclosed = await page.evaluate((rows) => {
  const acc = document.querySelector('#advanced-settings-span .accordion');
  return {
    active: acc.classList.contains('active'),
    contentH: acc.querySelector('.accordion-content').getBoundingClientRect().height,
    heights: Object.fromEntries(rows.map(id => [id, document.getElementById(id).getBoundingClientRect().height])),
  };
}, ROWS);
ok(!reclosed.active && reclosed.contentH === 0, `втори клик свива пак (${reclosed.contentH}px)`);
const reclosedClip = await page.evaluate(clippedProbe, ROWS);
ok(ROWS.every(id => reclosedClip[id]), `втори клик: редовете пак са отрязани (${JSON.stringify(reclosedClip)})`);

// --- 6. Изключване през toggleAdvancedSettings(): блокът се скрива, Create/Delete остават ---
await page.evaluate(async () => {
  localStorage.setItem('showAdvancedSettings', 'false');
  if (typeof updateAdvancedSettingsVisibility === 'function') await updateAdvancedSettingsVisibility();
});
await page.waitForTimeout(500);
const without = await page.evaluate(() => ({
  spanHidden: document.getElementById('advanced-settings-span').hasAttribute('hidden'),
  headerH: document.querySelector('#advanced-settings-span .accordion-header').getBoundingClientRect().height,
  createBtnVisible: document.getElementById('create-db-btn').getBoundingClientRect().height > 0,
  deleteBtnVisible: document.getElementById('delete-db-btn').getBoundingClientRect().height > 0,
}));
ok(without.spanHidden && without.headerH === 0, 'изключени разширени настройки: целият блок е скрит');
ok(without.createBtnVisible && without.deleteBtnVisible, 'Create/Delete остават видими и без разширени настройки');

// --- 7. Включване през toggleAdvancedSettings(true): акордеонът се отваря сам ---
await page.evaluate(async () => {
  localStorage.setItem('showAdvancedSettings', 'true');
  if (typeof updateAdvancedSettingsVisibility === 'function') await updateAdvancedSettingsVisibility();
});
await page.waitForTimeout(500);
await page.click('#advanced-settings-span .accordion-header');
await page.waitForTimeout(600);
const reenabled = await page.evaluate((rows) => {
  const acc = document.querySelector('#advanced-settings-span .accordion');
  return {
    spanHidden: document.getElementById('advanced-settings-span').hasAttribute('hidden'),
    active: acc.classList.contains('active'),
    heights: Object.fromEntries(rows.map(id => [id, Math.round(document.getElementById(id).getBoundingClientRect().height)])),
  };
}, ROWS);
ok(!reenabled.spanHidden, 'включване: блокът се показва');
ok(reenabled.active, 'включване: акордеонът се отваря с клик');
ok(ROWS.every(id => reenabled.heights[id] > 10), `включване: редовете се виждат (${JSON.stringify(reenabled.heights)})`);

ok(errs.length === 0, `нула конзолни грешки (${errs.join(' | ')})`);

await browser.close();
srv.close();
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
process.exit(fails ? 1 : 0);
