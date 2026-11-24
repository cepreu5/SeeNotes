// b5.49: дебъг панелът за споделяне се отваря САМО когато е поискан с ?share_debug=1
// (или от докосването на реда с версията в Настройки). Преди се отваряше сам до 3 минути
// след всяко споделяне — собственик (24.11.2026): „Но все пак се отваря панела“.
// Проверки:
//   1) без флаг и без скорошно споделяне панелът НЕ се отваря;
//   2) със share_debug=1 се отваря и показва записите;
//   3) със share_debug=1, но след успешна бележка, панелът НЕ изскача (флагът се маха);
//   4) ръчният вход (Настройки → ред с версията) отваря панела;
//   5) без грешки в конзолата.

import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8111/nomn/index.html';
const results = [];
function check(name, ok, extra = '') { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
  const url = route.request().url();
  const isScript = /\.js(\?|$)/.test(url);
  await route.fulfill({ status: 200, contentType: isScript ? 'application/javascript' : 'image/gif', body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') });
});

const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource|Refused to execute script/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => {
  const o = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
  window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2: o }, oauth2: o };
  window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
  window.kofiWidgetOverlay = { draw() { } };
  window.kofiwidget2 = { init() { }, draw() { } };
  localStorage.setItem('guide', 'false');
  localStorage.setItem('useIndexedDb', 'false');
  localStorage.setItem('language', 'bg');
  localStorage.setItem('singleNoteMode', 'false');
});

// Версията се чете в отделен контекст без service worker: иначе старият SW отговаря от кеша
// със старото име и проверката пада, макар файлът на сървъра да е новият.
const plainCtx = await browser.newContext({ serviceWorkers: 'block' });
const plainPage = await plainCtx.newPage();
await plainPage.goto(URL, { waitUntil: 'domcontentloaded' });
const swVersion = await plainPage.evaluate(async () => {
  try { const t = await (await fetch('sw.js?v=' + Date.now(), { cache: 'reload' })).text(); const m = t.match(/CACHE_NAME\s*=\s*'([^']+)'/); return m ? m[1] : ''; } catch (e) { return ''; }
});
await plainCtx.close();
check('sw.js е на версия b5.50', /b5\.50/.test(swVersion), swVersion);

const panel = () => page.evaluate(() => !!document.getElementById('share-debug-panel'));

// 1) Без флаг панелът не се отваря, дори със скорошен запис.
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(async () => {
  await appendShareDebug({ stage: 'test', note: 'скорошен запис', sid: 'sh-test', files: 0 });
  try { await maybeShowShareDebug(); } catch (e) {}
});
await page.waitForTimeout(400);
check('без флаг панелът не се отваря', !(await panel()));

// 2) Със share_debug=1 се отваря.
await page.goto(URL + '?share_debug=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(async () => { try { await maybeShowShareDebug(); } catch (e) {} });
await page.waitForTimeout(400);
check('със share_debug=1 панелът се отваря', await panel());
const hasText = await page.evaluate(() => (document.getElementById('share-debug-panel') || {}).textContent || '');
check('панелът показва записите', hasText.includes('ДЕБЪГ НА СПОДЕЛЯНЕТО') && hasText.includes('sh-test'), hasText.slice(0, 120));
// флагът се маха от адреса
const noFlag = await page.evaluate(() => !location.search.includes('share_debug'));
check('флагът се маха от адреса', noFlag);

// 3) С флаг, но след успешна бележка — панелът не изскача.
await page.goto(URL + '?share_debug=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const afterHandled = await page.evaluate(async () => {
  // Симулираме успешно споделяне: приложението маха share_debug от адреса (както при handled=true).
  const cleanUrl = new URL(window.location.href);
  if (cleanUrl.searchParams.has('share_debug')) { cleanUrl.searchParams.delete('share_debug'); window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search); }
  try { await maybeShowShareDebug(); } catch (e) {}
  return location.search.includes('share_debug');
});
await page.waitForTimeout(400);
check('след успешна бележка панелът не изскача', !(await panel()) && !afterHandled);

// 4) Ръчен вход (реда с версията) отваря панела.
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(async () => {
  initShareDebugTrigger();
  const label = document.querySelector('.modal-version');
  if (label) label.click();
  try { await maybeShowShareDebug(true); } catch (e) {}
});
await page.waitForTimeout(400);
check('ръчният вход (версия) отваря панела', await panel());

// 6) Панелът виси на общия флаг debug: и двата входа го проверяват.
// `const debug` е лексикална променлива, не window.debug — затова се чете от самия файл.
const mainSource = await page.evaluate(async () => {
  try { return await (await fetch('main.js', { cache: 'reload' })).text(); } catch (e) { return ''; }
});
const guard = /typeof debug === 'undefined' \|\| !debug/g;
const guardCount = (mainSource.match(guard) || []).length;
check('двата входа висят на общия флаг debug', guardCount >= 2, 'намерени проверки: ' + guardCount);
const inMaybe = /async function maybeShowShareDebug[\s\S]{0,200}typeof debug === 'undefined' \|\| !debug/.test(mainSource);
const inTrigger = /function initShareDebugTrigger[\s\S]{0,200}typeof debug === 'undefined' \|\| !debug/.test(mainSource);
check('проверката е в maybeShowShareDebug и в initShareDebugTrigger', inMaybe && inTrigger, JSON.stringify({ inMaybe, inTrigger }));

// 7) Service worker-ът не слага share_debug в адреса при пренасочване след споделяне.
const swSource = await page.evaluate(async () => {
  try { return await (await fetch('sw.js', { cache: 'reload' })).text(); } catch (e) { return ''; }
});
check('SW не включва дебъга сам при споделяне', !/searchParams\.set\('share_debug'/.test(swSource), (swSource.match(/share_debug[^\n]*/g) || []).join(' | ').slice(0, 120));

check('без грешки в конзолата', errors.length === 0, errors.slice(0, 3).join(' | '));

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} проверки минават`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
