// b3.85 (порт от nomn b5.52): бутон „Един файл с бележките“ в Разширени настройки до Запис на Архив.
// Събира всички бележки без тези в кошчето в един файл cx-notes.md (постоянно име, за NotebookLM),
// подредени по бордове, всяка с дата, заглавие и текст.
//
// Проверки:
//   1) бутонът е в Разширени настройки и се вижда;
//   2) надписът е на български при language=bg;
//   3) кликът дава изтегляне с име точно cx-notes.md;
//   4) файлът започва със заглавие и ред „Изтеглено: … брой бележки … брой борда“;
//   5) бележките са по бордове, в реда на бордовете, а вътре по дата (старата първа);
//   6) всяка бележка е „### дата час — заглавие“ и текстът не повтаря заглавието;
//   7) изтрита бележка не влиза, празна бележка не влиза;
//   8) бележка от изтрит борд влиза под „Без борд“;
//   9) броят на разделителите „---“ е равен на броя изнесени бележки;
//  10) втори клик дава същия файл с ново „Изтеглено“ (едно и също копие в NotebookLM);
//  11) без грешки в конзолата.

import path from 'path';
import fs from 'fs';
import os from 'os';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let chromium;
for (const p of [
  'playwright',
  '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
  '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
  '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs',
]) {
  try { ({ chromium } = await import(p)); break; } catch (e) { /* следващият път */ }
}
if (!chromium) {
  try { ({ chromium } = await import(path.join(__dirname, 'node_modules', 'playwright', 'index.mjs'))); } catch (e) { }
}
if (!chromium) { console.error('playwright не се намира'); process.exit(2); }

const URL = process.env.PAGE || 'http://127.0.0.1:8110/uni/index.html';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  — ' + extra : ''}`);
}

const at = (day, h, m) => new Date(2026, 10, day, h, m).getTime();

const NOTES = [
  // Работа (b1): две бележки, втората е по-стара, за да се види подредбата по дата
  { id: 1, gdid: 'n1', boardid: 'b1', status: 0, date: at(12, 14, 30), notetxt: 'Заглавие едно\nТекст на бележка първа.' },
  { id: 2, gdid: 'n2', boardid: 'b1', status: 0, date: at(3, 9, 5), notetxt: 'Стара бележка' },
  // Дом (b2)
  { id: 3, gdid: 'n3', boardid: 'b2', status: 0, date: at(20, 18, 0), notetxt: 'Ремонт\nБоя за стените, 2 литра.' },
  // Кошче: не се изнася
  { id: 4, gdid: 'n4', boardid: 'b1', status: 1, date: at(21, 10, 0), notetxt: 'ИЗТРИТА БЕЛЕЖКА' },
  // Празна: не се изнася
  { id: 5, gdid: 'n5', boardid: 'b1', status: 0, date: at(22, 10, 0), notetxt: '   \n  ' },
  // Борд, който е изтрит: бележката остава и влиза под „Без борд“
  { id: 6, gdid: 'n6', boardid: 'b3', status: 0, date: at(15, 8, 45), notetxt: 'Сираче\nБележка от изтрит борд.' },
];

const BOARDS = [
  { id: 1, gdid: 'b1', title: 'Работа', numord: 1, status: 0, datemod: Date.now() },
  { id: 2, gdid: 'b2', title: 'Дом', numord: 2, status: 0, datemod: Date.now() },
  { id: 3, gdid: 'b3', title: 'Изтрит борд', numord: 3, status: 1, datemod: Date.now() },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, acceptDownloads: true });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
  const isScript = /\.js(\?|$)/.test(route.request().url());
  await route.fulfill({
    status: 200,
    contentType: isScript ? 'application/javascript' : 'image/gif',
    body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'),
  });
});

const page = await ctx.newPage();
const errors = [];
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error' && !/404|Failed to load resource|Refused to execute script/.test(t)) errors.push(t);
});
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.addInitScript(() => {
  const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
  window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
  window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
  window.kofiWidgetOverlay = { draw() { } };
  window.kofiwidget2 = { init() { }, draw() { } };
  localStorage.setItem('guide', 'false');
  localStorage.setItem('useIndexedDb', 'false');
  localStorage.setItem('language', 'bg');
  localStorage.setItem('singleNoteMode', 'false');
  localStorage.setItem('showAdvancedSettings', 'false');
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(({ boards, notes }) => {
  try { startApp(); } catch (e) { window.__startAppError = String(e); }
  boardsData = JSON.parse(JSON.stringify(boards));
  allNotesData = JSON.parse(JSON.stringify(notes));
  mediaData = [];
  openNotesRestoreDone = true;
}, { boards: BOARDS, notes: NOTES });

const swText = await readFile(path.join(__dirname, '..', '..', 'uni', 'sw.js'), 'utf8');
const wantCache = (swText.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1] || '';
const swVersion = await page.evaluate(async () => {
  try {
    const txt = await (await fetch('sw.js', { cache: 'no-store' })).text();
    const m = txt.match(/CACHE_NAME\s*=\s*'([^']+)'/);
    return m ? m[1] : '';
  } catch (e) { return ''; }
});
check('sw.js в браузъра е този от uni/sw.js', !!wantCache && swVersion === wantCache, swVersion + ' // ' + wantCache);

// --- настройки → Разширени настройки (истинският път: Ctrl+клик по заглавието на Настройки) ---
await page.evaluate(() => {
  const m = document.getElementById('settings-modal');
  if (m) m.classList.remove('visible');
  document.getElementById('settings_button').click();
});
await page.waitForTimeout(1200);
const modalState = await page.evaluate(() => {
  const m = document.getElementById('settings-modal');
  const cs = getComputedStyle(m);
  return { cls: m.className, display: cs.display, vis: cs.visibility, op: cs.opacity, h: Math.round(m.getBoundingClientRect().height) };
});
check('Настройки се отварят', /visible/.test(modalState.cls) && modalState.h > 0, JSON.stringify(modalState));
await page.waitForTimeout(400);
const accOpen = await page.evaluate(() => {
  const title = document.querySelector('#settings-modal .modal-content-box h3');
  if (title) title.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
  const span = document.getElementById('advanced-settings-span');
  const acc = span && span.querySelector('.accordion');
  const content = acc && acc.querySelector('.accordion-content');
  return {
    spanHidden: span ? span.hasAttribute('hidden') : null,
    active: !!(acc && acc.classList.contains('active')),
    maxHeight: content ? getComputedStyle(content).maxHeight : null,
  };
});
check('Разширени настройки се отварят', accOpen.spanHidden === false && accOpen.active && accOpen.maxHeight !== '0px', JSON.stringify(accOpen));
await page.waitForTimeout(700);

const btn = await page.evaluate(() => {
  const b = document.getElementById('export-md-btn');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  const saveBtn = document.getElementById('save-btn');
  const sr = saveBtn ? saveBtn.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    text: b.textContent.trim(),
    visible: r.width > 0 && r.height > 0,
    width: Math.round(r.width),
    height: Math.round(r.height),
    inAdvanced: !!b.closest('#advanced-settings-span'),
    hitIsButton: hit === b || b.contains(hit),
    hitElement: hit ? (hit.id || hit.className || hit.tagName) : null,
    saveTop: sr ? Math.round(sr.top) : null,
    top: Math.round(r.top),
  };
});
check('бутонът „Един файл с бележките“ е в Разширени настройки', !!btn && btn.inAdvanced, btn ? JSON.stringify(btn) : 'няма бутон');
check('бутонът се вижда', !!btn && btn.visible && btn.width > 100, btn ? `${btn.width}×${btn.height}` : '');
check('надписът е на български', !!btn && btn.text === 'Един файл с бележките', btn ? btn.text : '');
check('кликът стига до бутона (нищо не го закрива)', !!btn && btn.hitIsButton, btn ? String(btn.hitElement) : '');
check('стои до Запис на Архив (под него в същия блок)', !!btn && btn.saveTop !== null && Math.abs(btn.top - btn.saveTop) < 200, btn ? `save=${btn.saveTop} btn=${btn.top}` : '');

// --- клик → изтегляне ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cxmd-'));
async function clickAndGetFile(name) {
  await page.evaluate(() => document.getElementById('export-md-btn').scrollIntoView({ block: 'center' }));
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#export-md-btn'),
  ]);
  const suggested = download.suggestedFilename();
  const file = path.join(tmp, name);
  await download.saveAs(file);
  return { suggested, file, content: fs.readFileSync(file, 'utf8') };
}

let first = null;
try {
  first = await clickAndGetFile('first.md');
} catch (e) {
  check('кликът дава изтегляне', false, String(e));
}

if (first) {
  check('файлът се казва точно cx-notes.md', first.suggested === 'cx-notes.md', first.suggested);
  const c = first.content;
  const lines = c.split('\n');
  check('започва със заглавие SeeNotes', /^# SeeNotes — всички бележки/.test(lines[0]), lines[0]);
  check('има ред „Изтеглено“ с брой бележки и борда', /^Изтеглено: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} · 4 бележки · 3 борда$/.test(lines[2]), lines[2]);

  const iWork = c.indexOf('## Работа');
  const iHome = c.indexOf('## Дом');
  const iNoBoard = c.indexOf('## Без борд');
  check('бордовете са в реда на приложението', iWork > -1 && iHome > iWork && iNoBoard > iHome, `работа=${iWork} дом=${iHome} без=${iNoBoard}`);

  check('старата бележка е преди новата в борда', c.indexOf('Стара бележка') < c.indexOf('Текст на бележка първа'), '');
  check('заглавие с дата и час', c.includes('### 12.11.2026 14:30 — Заглавие едно'), '');
  check('текстът на бележката не повтаря заглавието', /### 12\.11\.2026 14:30 — Заглавие едно\n\nТекст на бележка първа\./.test(c), '');
  check('едноредова бележка влиза само веднъж (без повторен ред)', /### 03\.11\.2026 09:05 — Стара бележка\n\n---/.test(c) && (c.match(/Стара бележка/g) || []).length === 1, String((c.match(/Стара бележка/g) || []).length));
  check('изтрита бележка не влиза', !c.includes('ИЗТРИТА БЕЛЕЖКА'), '');
  check('бележка от изтрит борд влиза под „Без борд“', iNoBoard > -1 && c.slice(iNoBoard).includes('Сираче'), '');
  const separators = (c.match(/^---$/gm) || []).length;
  check('по един разделител на бележка', separators === 4, String(separators));
  check('празна бележка не влиза (няма празен блок)', !/### [^\n]+\n\n\n/.test(c), '');
}

// --- втори клик: същият файл, ново „Изтеглено“ ---
if (first) {
  await page.waitForTimeout(1100);
  const second = await clickAndGetFile('second.md').catch(() => null);
  if (second) {
    check('втори клик дава същия файл', second.suggested === 'cx-notes.md', second.suggested);
    const head = second.content.split('\n')[0];
    check('съдържанието е същото освен реда „Изтеглено“', head === first.content.split('\n')[0] &&
      second.content.split('\n').slice(3).join('\n') === first.content.split('\n').slice(3).join('\n'), '');
  } else {
    check('втори клик дава същия файл', false, 'няма изтегляне');
  }
}

// --- файлът се вижда и на английски ---
await page.evaluate(async () => { if (typeof setLanguage === 'function') await setLanguage('en'); });
await page.waitForTimeout(600);
const enText = await page.evaluate(() => {
  const b = document.getElementById('export-md-btn');
  return b ? b.textContent.trim() : '';
});
check('надписът се сменя с езика', enText === 'All notes in one file', enText);
await page.evaluate(async () => { if (typeof setLanguage === 'function') await setLanguage('bg'); });

check('без грешки в конзолата', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверки минават`);
process.exit(failed.length ? 1 : 0);
