// Модалът Настройки: ширината от 400px до 900px трябва да е същата като над 900px (max 400px),
// а не да се разпъва по цялата ширина. Под 400px остава по цялата ширина.
// Пуска се от корена на хранилището:  node .bolter/check/settings-modal-width.mjs
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
page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });

// Модалът съществува статично в index.html — показваме го без да стартираме приложението,
// за да мерим само CSS ширината.
const measure = async (w) => {
  await page.setViewportSize({ width: w, height: 900 });
  await page.evaluate(() => {
    const m = document.getElementById('settings-modal');
    m.classList.add('visible');
  });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Модалът влиза с transform scale(0.7)→scale(1) за 0.4s; мерим едва след анимацията.
  await page.waitForTimeout(700);
  const box = await page.evaluate(() => {
    const el = document.querySelector('#settings-modal .modal-content-box');
    const r = el.getBoundingClientRect();
    return { width: Math.round(r.width * 100) / 100, left: Math.round(r.left), right: Math.round(window.innerWidth - r.right) };
  });
  return box;
};

const wide = await measure(1280);
ok(wide.width === 400, `1280px: ширина ${wide.width}px (очаквано 400)`);
ok(wide.left > 0 && Math.abs(wide.left - wide.right) <= 1, `1280px: центриран (ляво ${wide.left}, дясно ${wide.right})`);

for (const w of [900, 899, 820, 700, 620, 500, 410, 400]) {
  const b = await measure(w);
  ok(b.width === wide.width, `${w}px: ширина ${b.width}px, същата като на 1280px (${wide.width}px)`);
  ok(b.left >= 0 && Math.abs(b.left - b.right) <= 1, `${w}px: центриран (ляво ${b.left}, дясно ${b.right})`);
}

for (const w of [399, 360]) {
  const b = await measure(w);
  ok(b.width === w, `${w}px: по цялата ширина ${b.width}px (очаквано ${w})`);
}

ok(errs.length === 0, `нула конзолни грешки (${errs.join(' | ')})`);

await browser.close();
srv.close();
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
process.exit(fails ? 1 : 0);
