// One-click links (квадратчето в Settings) трябва да оцелява след презареждане.
// Преди: change-ът пишеше само localStorage, а при старт loadSettingsFromGDrive презаписваше
// ключа от профилния снапшот / settings.json - изборът се губеше на всяко презареждане.
// Пуска се от корена на хранилището:  node .bolter/check/onetap-persist.mjs
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

// В истинския старт createSettingsUI се вика от setup пътя; в headless той не минава, затова
// го викаме изрично - иначе квадратчето съществува в DOM, но без слушател и кликът не прави нищо.
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

// --- 1. Липсваща стойност значи ИЗКЛЮЧЕНО навсякъде (еднакво за markdown линкове и прикачени файлове) ---
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.evaluate(() => { for (const k of ['oneTapLink', 'settings_multinotes_data', 'deviceName']) localStorage.removeItem(k); });
await page.reload({ waitUntil: 'load' });
await boot();
const defaults = await page.evaluate(() => ({
  helper: isOneTapLinksEnabled(),
  raw: localStorage.getItem('oneTapLink'),
  markdownAnchors: (() => { const d = document.createElement('div'); d.innerHTML = getFormattedNoteHtml('виж https://example.com/a', '', '', false); return { a: d.querySelectorAll('a').length, elide: d.querySelectorAll('.nmd-link-elide').length }; })(),
}));
ok(defaults.helper === false, `липсва ключ: isOneTapLinksEnabled() е false (${defaults.helper})`);
ok(defaults.markdownAnchors.a === 0 && defaults.markdownAnchors.elide === 1, `липсва ключ: линкът на борда е съкратен span (a=${defaults.markdownAnchors.a}, elide=${defaults.markdownAnchors.elide})`);

// --- 2. Включване през истинското квадратче в Settings ---
await page.evaluate(() => {
  document.getElementById('settings-modal').classList.add('visible');
});
await page.waitForSelector('#one-tap-link-checkbox', { state: 'attached' });
const before = await page.evaluate(() => document.getElementById('one-tap-link-checkbox').checked);
ok(before === false, `квадратчето тръгва изключено при празна настройка (${before})`);
await page.evaluate(() => {
  const cb = document.getElementById('one-tap-link-checkbox');
  cb.checked = true;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
const afterToggle = await page.evaluate(() => ({
  ls: localStorage.getItem('oneTapLink'),
  // Снапшотът е или плосък (стария формат), или {устройство: {...}} - четем и двата.
  snapshot: (() => {
    const raw = localStorage.getItem('settings_multinotes_data'); if (!raw) return null;
    try {
      const p = JSON.parse(raw);
      if (Object.prototype.hasOwnProperty.call(p, 'oneTapLink')) return p.oneTapLink;
      const dev = Object.keys(p)[0];
      return p[dev] ? p[dev].oneTapLink : null;
    } catch { return 'unparsable'; }
  })(),
}));
ok(afterToggle.ls === 'true', `след клик localStorage е 'true' (${afterToggle.ls})`);
ok(afterToggle.snapshot === 'true', `след клик профилният снапшот също е 'true' (${afterToggle.snapshot})`);

// --- 3. Презареждане: изборът остава и квадратчето е отметнато ---
await page.reload({ waitUntil: 'load' });
await boot();
await page.evaluate(() => document.getElementById('settings-modal').classList.add('visible'));
await page.waitForSelector('#one-tap-link-checkbox', { state: 'attached' });
const afterReload = await page.evaluate(() => ({
  ls: localStorage.getItem('oneTapLink'),
  checked: document.getElementById('one-tap-link-checkbox').checked,
  markdownAnchors: (() => { const d = document.createElement('div'); d.innerHTML = getFormattedNoteHtml('виж https://example.com/a', '', '', false); return { a: d.querySelectorAll('a').length, elide: d.querySelectorAll('.nmd-link-elide').length }; })(),
}));
ok(afterReload.ls === 'true', `след презареждане localStorage пази 'true' (${afterReload.ls})`);
ok(afterReload.checked === true, `след презареждане квадратчето е отметнато (${afterReload.checked})`);
ok(afterReload.markdownAnchors.a === 1 && afterReload.markdownAnchors.elide === 0, `след презареждане линкът на борда е активен (a=${afterReload.markdownAnchors.a}, elide=${afterReload.markdownAnchors.elide})`);

// --- 4. Изключване и пак презареждане: остава изключено ---
await page.evaluate(() => {
  const cb = document.getElementById('one-tap-link-checkbox');
  cb.checked = false;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
await page.reload({ waitUntil: 'load' });
await boot();
await page.evaluate(() => document.getElementById('settings-modal').classList.add('visible'));
await page.waitForSelector('#one-tap-link-checkbox', { state: 'attached' });
const afterOff = await page.evaluate(() => ({
  ls: localStorage.getItem('oneTapLink'),
  checked: document.getElementById('one-tap-link-checkbox').checked,
}));
ok(afterOff.ls === 'false', `след изключване и презареждане localStorage е 'false' (${afterOff.ls})`);
ok(afterOff.checked === false, `след изключване и презареждане квадратчето е празно (${afterOff.checked})`);

ok(errs.length === 0, `няма конзолни грешки (${errs.length})${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
await browser.close(); srv.close();
process.exit(fails === 0 ? 0 : 1);
