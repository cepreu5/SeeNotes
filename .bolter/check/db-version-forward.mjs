// NotesDB трябва да се отваря, когато базата вече е на ПО-ВИСОКА версия от декларираната.
// Реален случай (2026-10-20): собственикът пробвал локалния режим (feat/local-mode), който вдига
// NotesDB на версия 4 със store `files`; после cx-notes (тогава v3) гърми с
//   VersionError - The requested version (3) is less than the existing version (4)
// и той остава заключен извън собствените си бележки. Тестът строи базата ПРЕДИ зареждането
// на приложението и проверява четири състояния: v4 (неговото), v5 (бъдещ вариант), v3 с данни
// (нормален ъпгрейд) и чиста инсталация.
//
//   node .bolter/check/db-version-forward.mjs        (exit 1 при провал)
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

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });

// Готова база със зададена версия и схема. 'files' е store-ът, който локалният режим добавя.
const seedDB = (page, version, stores, records = []) => page.evaluate(async ({ version, stores, records }) => {
  await new Promise(r => { const d = indexedDB.deleteDatabase('NotesDB'); d.onsuccess = d.onerror = d.onblocked = r; setTimeout(r, 3000); });
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('NotesDB', version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, opts] of stores) db.createObjectStore(name, opts);
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });
  if (!records.length) return;
  const db = await new Promise((res, rej) => { const r2 = indexedDB.open('NotesDB'); r2.onsuccess = () => res(r2.result); r2.onerror = () => rej(r2.error); });
  await new Promise((res, rej) => {
    const tx = db.transaction(['notes'], 'readwrite');
    records.forEach(n => tx.objectStore('notes').put(n));
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
}, { version, stores, records });

// Зарежда приложението върху готовата база и връща какво е станало с openNotesDB().
const loadApp = async (ctx) => {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openNotesDB === 'function', null, { timeout: 20000 });
  const res = await page.evaluate(async () => {
    try {
      const db = await openNotesDB();
      const names = [...db.objectStoreNames];
      const notes = await new Promise((resolve) => {
        const tx = db.transaction(['notes'], 'readonly');
        const r = tx.objectStore('notes').getAll();
        r.onsuccess = () => resolve((r.result || []).map(n => n.notetxt));
      });
      db.close();
      return { ok: true, version: db.version, names, notes };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });
  await page.close();
  return { ...res, errs };
};

const newCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  return ctx;
};

const FULL = [['boards', { keyPath: 'gdid' }], ['media', { keyPath: 'gdid' }], ['notes', { keyPath: 'gdid' }], ['config', {}]];
const BASE_NOTE = { gdid: 'local-1', notetxt: 'Бележка от работната база', notetitle: 'тест', boardid: 'b1' };

// 1) Точно неговото състояние: v4, схема v4 (с files), бележка вътре.
{
  const ctx = await newCtx(); const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openNotesDB === 'function');
  await seedDB(page, 4, [...FULL, ['files', { keyPath: 'key' }]], [BASE_NOTE]);
  await page.close();

  const r = await loadApp(ctx);
  ok(r.ok, `v4 база (както след локалния режим) се отваря${r.ok ? '' : ': ' + r.error}`);
  if (r.ok) {
    ok(r.version === 4, `отворена е на версия 4 (получено ${r.version})`);
    ok(['boards', 'media', 'notes', 'config', 'files'].every(n => r.names.includes(n)),
      `всичките 5 store-а са налични (${r.names.join(',')})`);
    ok(r.notes.includes(BASE_NOTE.notetxt), `бележката е непокътната (${JSON.stringify(r.notes)})`);
  }
  await ctx.close();
}

// 2) Бъдещ вариант над 4: приложението пак трябва да отвори и да чете.
{
  const ctx = await newCtx(); const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openNotesDB === 'function');
  await seedDB(page, 5, [...FULL, ['files', { keyPath: 'key' }], ['future', { keyPath: 'id' }]], [BASE_NOTE]);
  await page.close();

  const r = await loadApp(ctx);
  ok(r.ok, `v5 база не заключва приложението${r.ok ? '' : ': ' + r.error}`);
  if (r.ok) ok(r.notes.includes(BASE_NOTE.notetxt), `v5: бележката се чете (${JSON.stringify(r.notes)})`);
  await ctx.close();
}

// 3) Нормален път: база на v3 с данни се вдига до 4 и store files се създава.
{
  const ctx = await newCtx(); const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openNotesDB === 'function');
  await seedDB(page, 3, FULL, [BASE_NOTE]);
  await page.close();

  const r = await loadApp(ctx);
  ok(r.ok, `v3 база се отваря${r.ok ? '' : ': ' + r.error}`);
  if (r.ok) {
    ok(r.version === 4, `v3 е вдигната до 4 (получено ${r.version})`);
    ok(r.names.includes('files'), `store files е създаден (${r.names.join(',')})`);
    ok(r.notes.includes(BASE_NOTE.notetxt), `v3: бележката оцелява ъпгрейда (${JSON.stringify(r.notes)})`);
  }
  await ctx.close();
}

// 4) Чиста инсталация.
{
  const ctx = await newCtx(); const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openNotesDB === 'function');
  await seedDB(page, 1, []);   // празна база на v1: пълно изграждане на схемата
  await page.close();

  const r = await loadApp(ctx);
  ok(r.ok, `чиста база се отваря${r.ok ? '' : ': ' + r.error}`);
  if (r.ok) {
    ok(r.version === 4, `чиста база: версия 4 (получено ${r.version})`);
    ok(['boards', 'media', 'notes', 'config', 'files'].every(n => r.names.includes(n)),
      `чиста база: 5 store-а (${r.names.join(',')})`);
  }
  await ctx.close();
}

await browser.close();
srv.close();
console.log(fails ? `\n${fails} FAIL` : '\nall ok');
process.exit(fails ? 1 : 0);
