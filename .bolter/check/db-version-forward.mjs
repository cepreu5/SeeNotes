// NotesDB: отваряне на база, която е на по-нова версия от приложението.
// Симптомът, който проверяваме: браузърът държи NotesDB версия 4 (вдигната от друг
// билд на приложението), а main отваря с версия 3 -> VersionError и приложението
// остава без бележки ("Error in startApp: Error opening NotesDB: undefined").
// Очаквано след поправката:
//   - база на версия 4 с бележка се отваря, бележката е четлива, версията остава 4;
//   - при старт на приложението няма "Error opening NotesDB" и няма "Error in startApp";
//   - чиста инсталация създава версия 3 с четирите store-а;
//   - база на версия 5 (бъдеща) също се отваря;
//   - стара база (версия 2) се вдига нормално до 3 и липсващите store-ове се създават.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/db-version-forward.mjs        (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
  if (!cond) fails++;
};

const browser = await chromium.launch();

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('language', 'bg');
      localStorage.setItem('hideAssistant', 'true');
      localStorage.setItem('notesBgrd', 'false');
      localStorage.setItem('demoMode', 'false');
    } catch (e) { }
    window.gapi = {
      load() { },
      client: {
        setToken() { },
        getToken() { return { access_token: 'tok' }; },
        drive: { files: { list: () => Promise.resolve({ result: { files: [] } }), get: () => Promise.resolve({ result: {} }) } },
      },
      auth: { getToken() { return { access_token: 'tok' }; } },
    };
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('pageerror: ' + (e && e.message)));
  return { ctx, page, logs };
}

// Създава NotesDB на точна версия, с точно определен набор store-ове и една бележка.
const SEED = async ({ version, stores, note }) => new Promise((resolve, reject) => {
  const req = indexedDB.open('NotesDB', version);
  req.onupgradeneeded = () => {
    const db = req.result;
    for (const s of stores) db.createObjectStore(s, s === 'config' ? {} : { keyPath: 'gdid' });
  };
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    if (!note || !db.objectStoreNames.contains('notes')) { db.close(); resolve(); return; }
    const tx = db.transaction(['notes'], 'readwrite');
    tx.objectStore('notes').put(note);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  };
});

const STATE = () => {
  return openNotesDB().then(async (db) => {
    const out = { version: db.version, stores: Array.from(db.objectStoreNames).sort() };
    db.close();
    try {
      const all = await getAllFromDB(NOTE_STORE_NAME);
      out.notes = all.map(x => x && (x.gdid || x.id || x.title));
    } catch (e) { out.notesError = String(e && e.message ? e.message : e); }
    return out;
  }, (e) => ({ error: String(e && e.message ? e.message : e), errorName: e && e.name }));
};

// --- 1. База версия 4 (вдигната от cx-notes билда), с бележка ---
{
  const { ctx, page, logs } = await newPage();
  await page.goto(ORIGIN + '/_blank.html');
  await page.evaluate(SEED, {
    version: 4,
    stores: ['boards', 'media', 'notes', 'config', 'files'],
    note: { gdid: 'note-v4', title: 'Бележка от версия 4', content: 'x' },
  });
  await page.goto(ORIGIN + '/index-2.html');
  await page.waitForTimeout(1500);
  const state = await page.evaluate(STATE);
  ok(!state.error, 'v4: openNotesDB не хвърля', state);
  ok(state.version === 4, 'v4: базата остава на версия 4 (не се пресъздава)', state);
  ok((state.stores || []).includes('notes'), 'v4: notes store е наличен', state);
  ok((state.notes || []).includes('note-v4'), 'v4: бележката е четлива', state);
  ok((state.stores || []).includes('files'), 'v4: files store от другия билд не е изтрит', state);
  const joined = logs.join('\n');
  ok(!/Error opening NotesDB/.test(joined), 'v4: няма "Error opening NotesDB" при старт', joined.slice(0, 400));
  ok(!/Error in startApp/.test(joined), 'v4: няма "Error in startApp" при старт', joined.slice(0, 400));
  await ctx.close();
}

// --- 2. Чиста инсталация ---
{
  const { ctx, page } = await newPage();
  await page.goto(ORIGIN + '/index-2.html');
  await page.waitForTimeout(1200);
  const state = await page.evaluate(STATE);
  ok(!state.error, 'чиста: openNotesDB не хвърля', state);
  ok(state.version === 3, 'чиста: създава се версия 3', state);
  ok(JSON.stringify(state.stores) === JSON.stringify(['boards', 'config', 'media', 'notes']),
    'чиста: четирите store-а', state);
  await ctx.close();
}

// --- 3. Бъдеща версия 5 ---
{
  const { ctx, page } = await newPage();
  await page.goto(ORIGIN + '/_blank.html');
  await page.evaluate(SEED, { version: 5, stores: ['boards', 'media', 'notes', 'config', 'files', 'extra'], note: { gdid: 'note-v5', title: 'v5' } });
  await page.goto(ORIGIN + '/index-2.html');
  await page.waitForTimeout(1200);
  const state = await page.evaluate(STATE);
  ok(!state.error, 'v5: openNotesDB не хвърля', state);
  ok(state.version === 5, 'v5: версията остава 5', state);
  ok((state.notes || []).includes('note-v5'), 'v5: бележката е четлива', state);
  await ctx.close();
}

// --- 4. Стара база (версия 2) без config и media ---
{
  const { ctx, page } = await newPage();
  await page.goto(ORIGIN + '/_blank.html');
  await page.evaluate(SEED, { version: 2, stores: ['boards', 'notes'], note: { gdid: 'note-v2', title: 'v2' } });
  await page.goto(ORIGIN + '/index-2.html');
  await page.waitForTimeout(1200);
  const state = await page.evaluate(STATE);
  ok(!state.error, 'v2: openNotesDB не хвърля', state);
  ok(state.version === 3, 'v2: базата се вдига до 3', state);
  ok(JSON.stringify(state.stores) === JSON.stringify(['boards', 'config', 'media', 'notes']),
    'v2: липсващите store-ове са създадени', state);
  ok((state.notes || []).includes('note-v2'), 'v2: бележката е запазена', state);
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${fails === 0 ? 'ALL PASS' : 'FAILURES'}: ${n - fails}/${n}`);
process.exit(fails === 0 ? 0 : 1);
