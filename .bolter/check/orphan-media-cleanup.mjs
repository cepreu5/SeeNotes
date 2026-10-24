// Бутонът в set.html „Изтрий записи и файлове без бележка": сканира само за четене, показва преглед,
// и трие САМО след потвърждение - запис (media.txt), чиято noteid не съответства на нито един
// note.txt (жив или в кошчето), и файл в Images/Sound/Video/Other, който няма никакъв запис.
// Всяко изтрито нещо дава по ЕДИН ред в лога с името си и откъде е изтрито (Drive или локалната
// папка). Нечетим media.txt не се трие.
// Собственик (24.10.2026): „сложи в set.html бутон за изтриване на стари записи/приложения без
// бележки“ + „да показва и лог на изтритите файлове и от къде са изтрити“.
// Проверяват се заявките, които наистина тръгват към Drive (DELETE по id), текстът на лога и какво
// остава в паметта на приложението - тоест наблюдава се резултатът, не кодът.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/orphan-media-cleanup.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
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

let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

// --- Фалшив Google Drive ----------------------------------------------------------------
const WS = 'FOLDER_WS', FOLDER_IMAGES = 'FOLDER_IMAGES', FOLDER_VIDEO = 'FOLDER_VIDEO';
// deletes пази id-тата, за които приложението е поискало DELETE: единственото, което наистина трие.
const deletes = [];
const rec = (id, idNum, noteid, file, fileId, type) => ({
  id,
  body: JSON.stringify({ datemod: 1, description: '', gdid: id, id: idNum, noteid, path: file, pathGD: fileId, type })
});
const freshDrive = () => ({
  // Жива бележка и бележка в кошчето: и двете са собственици на прикачените си.
  notesAlive: [{ id: 'NOTE_ALIVE', name: 'note.txt', trashed: false }],
  notesTrashed: [{ id: 'NOTE_TRASH', name: 'note.txt', trashed: true }],
  media: [
    rec('REC_ORPHAN', 17, 'NOTE_GONE', 'orphan.png', 'IMG_ORPHAN', 1),   // бележката липсва -> трие се
    rec('REC_ALIVE', 18, 'NOTE_ALIVE', 'alive.png', 'IMG_ALIVE', 1),     // жива бележка -> остава
    rec('REC_TRASH', 19, 'NOTE_TRASH', 'trashnote.png', 'IMG_TRASHNOTE', 1), // в кошчето -> остава
    rec('REC_NONO', 20, '', 'nono.png', 'IMG_NONO', 1),                  // празна noteid -> трие се
    { id: 'REC_BAD', body: 'това не е JSON' }                            // нечетим -> не се трие
  ],
  images: [
    { id: 'IMG_ORPHAN', name: 'orphan.png' },
    { id: 'IMG_ALIVE', name: 'alive.png' },
    { id: 'IMG_TRASHNOTE', name: 'trashnote.png' },
    { id: 'IMG_NONO', name: 'nono.png' },
    { id: 'IMG_LOOSE', name: 'loose.png' }                               // никакъв запис -> трие се
  ],
  video: [{ id: 'VID_LOOSE', name: 'clip.mp4' }]                          // никакъв запис -> трие се
});
let drive = freshDrive();
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const qValue = (q, key) => (q.match(new RegExp(key + "\\s*=\\s*'([^']*)'")) || [])[1] || '';

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  const u = new URL(url);
  // 1. Самото изтриване: по него се вижда какво е изчезнало от Drive.
  const del = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)$/);
  if (del && method === 'DELETE') {
    const id = decodeURIComponent(del[1]);
    deletes.push(id);
    return route.fulfill({ status: 204, body: '' });
  }
  // 2. Съдържание на файл (media.txt запис): ?alt=media
  const media = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media$/);
  if (media) {
    const id = decodeURIComponent(media[1]);
    const found = drive.media.find(m => m.id === id);
    if (!found) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"message":"not found"}}' });
    return route.fulfill({ status: 200, contentType: 'text/plain', body: found.body });
  }
  // 3. Метаданни на папка по id (findWorkingFolderId ги пита, преди да търси по име).
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=id,name,mimeType,trashed$/);
  if (meta) {
    const id = decodeURIComponent(meta[1]);
    const known = { [WS]: 'CX-Notes', [FOLDER_IMAGES]: 'Images', [FOLDER_VIDEO]: 'Video' };
    if (!known[id]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"message":"not found"}}' });
    return route.fulfill(json({ id, name: known[id], mimeType: 'application/vnd.google-apps.folder', trashed: false }));
  }
  // 4. Списъци в Drive.
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const params = u.searchParams;
    if (params.get('spaces') === 'appDataFolder') return route.fulfill(json({ files: [] }));
    const q = params.get('q') || '';
    const folder = qValue(q, 'name');
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      if (q.includes(`'${WS}' in parents`)) {
        const id = folder === 'Images' ? FOLDER_IMAGES : (folder === 'Video' ? FOLDER_VIDEO : null);
        return route.fulfill(json({ files: id ? [{ id, name: folder }] : [] }));
      }
      return route.fulfill(json({ files: [] }));
    }
    if (q.includes(`'${FOLDER_IMAGES}' in parents`)) {
      return route.fulfill(json({ files: drive.images.map(f => ({ id: f.id, name: f.name, trashed: false })) }));
    }
    if (q.includes(`'${FOLDER_VIDEO}' in parents`)) {
      return route.fulfill(json({ files: drive.video.map(f => ({ id: f.id, name: f.name, trashed: false })) }));
    }
    if (folder === 'note.txt') {
      const trashed = /trashed=true/.test(q);
      return route.fulfill(json({ files: trashed ? drive.notesTrashed : drive.notesAlive }));
    }
    if (folder === 'media.txt') {
      return route.fulfill(json({ files: drive.media.map(m => ({ id: m.id, name: 'media.txt' })) }));
    }
    return route.fulfill(json({ files: [] }));
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  if (url.startsWith('https://storage.ko-fi.com/')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});

const errs = [];
const watch = (page, tag) => {
  page.on('pageerror', e => errs.push(`${tag}: ${String(e.message).slice(0, 200)}`));
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(`${tag}: ${String(m.text()).slice(0, 200)}`); });
};

await ctx.addInitScript(() => {
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
  localStorage.setItem('language', 'bg');
  localStorage.setItem('lang', 'bg');
  localStorage.setItem('activeFolderId', 'FOLDER_WS'); // работната папка е известна на приложението
  window.gapi = {
    load() { },
    client: {
      setToken() { }, getToken() { return { access_token: 'tok' }; },
      drive: { files: { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); } } },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
});

// =====================================================================================
// (А) Страницата на настройките, отворена сама (без window.opener): Drive се трие, локалната
//     папка не е достъпна и логът го казва.
// =====================================================================================
const setPage = await ctx.newPage();
watch(setPage, 'set');
await setPage.goto(`http://localhost:${PORT}/set.html`, { waitUntil: 'load' });
await setPage.waitForFunction(() => typeof initOrphanMediaCleanup === 'function', null, { timeout: 20000 });

const scanAndDelete = async (page) => {
  await page.click('#orphan-media-btn');
  await page.waitForFunction(() => {
    const g = document.getElementById('orphan-media-go');
    return g && !g.disabled;
  }, null, { timeout: 20000 });
};
const logText = (page) => page.evaluate(() => document.getElementById('orphan-media-log').textContent || '');
const logLines = async (page) => (await logText(page)).split('\n').filter(l => l.trim() !== '');
const waitLog = (page) => page.waitForFunction(() => {
  const el = document.getElementById('orphan-media-log');
  return el && el.textContent && el.textContent.trim() !== '';
}, null, { timeout: 20000 });

deletes.length = 0;
await scanAndDelete(setPage);
const preview = await setPage.evaluate(() => ({
  records: document.getElementById('orphan-media-records-count').textContent,
  files: document.getElementById('orphan-media-files-count').textContent,
  drive: document.getElementById('orphan-media-drive-count').textContent,
  recordsList: document.getElementById('orphan-media-records-list').textContent,
  filesList: document.getElementById('orphan-media-files-list').textContent,
  goText: document.getElementById('orphan-media-go').textContent
}));
ok(deletes.length === 0, `(1) сканирането не прави нито една DELETE заявка (${JSON.stringify(deletes)})`, deletes);
ok(preview.records === '2', `(2) прегледът брои 2 записа без бележка (${preview.records})`, preview);
ok(preview.files === '2', `(2) прегледът брои 2 файла без запис (${preview.files})`, preview);
ok(preview.drive === '4', `(2) прегледът брои 4 файла за триене в Drive (${preview.drive})`, preview);
ok(preview.recordsList.includes('orphan.png') && preview.recordsList.includes('NOTE_GONE'),
  '(2) редът на записа показва името и noteid', preview.recordsList);
ok(preview.filesList.includes('loose.png') && preview.filesList.includes('clip.mp4'),
  '(2) списъкът на файловете показва loose.png и clip.mp4', preview.filesList);
ok(!preview.recordsList.includes('alive.png') && !preview.recordsList.includes('trashnote.png'),
  '(3) записите на жива бележка и на бележка в кошчето не са в прегледа', preview.recordsList);
const warnA = await setPage.evaluate(() => document.getElementById('orphan-media-status').textContent);
ok(/не можа да се прочете/.test(warnA), `(6) прегледът казва, че нечетимият media.txt не се трие (${warnA})`, warnA);
ok(/Внимание/.test(warnA), `(6) прегледът предупреждава, че файловете на нечетимия запис може да изглеждат без запис (${warnA})`, warnA);
ok(preview.goText === 'Изтрий 6', `(2) бутонът казва колко ще се трие - 2 записа и 4 файла (${preview.goText})`, preview);
await setPage.click('#orphan-media-go');
await waitLog(setPage);
const linesA = await logLines(setPage);
const delA = deletes.slice();
ok(delA.includes('REC_ORPHAN') && delA.includes('REC_NONO'),
  `(4) записите без бележка се трият в Drive (${JSON.stringify(delA)})`, delA);
ok(delA.includes('IMG_ORPHAN') && delA.includes('IMG_NONO') && delA.includes('IMG_LOOSE') && delA.includes('VID_LOOSE'),
  `(4) файловете на записите и файловете без запис се трият в Drive (${JSON.stringify(delA)})`, delA);
ok(!delA.includes('REC_ALIVE') && !delA.includes('REC_TRASH'), '(5) записите на жива бележка и на бележка в кошчето остават', delA);
ok(!delA.includes('IMG_ALIVE') && !delA.includes('IMG_TRASHNOTE'), '(5) файловете им също остават', delA);
ok(!delA.includes('REC_BAD'), '(6) нечетимият media.txt не се трие', delA);
ok(linesA.some(l => l.includes('media.txt запис #17') && l.includes('Drive') && l.includes('запис')),
  `(7) логът показва записа #17 като изтрит от Drive (${JSON.stringify(linesA)})`, linesA);
ok(linesA.some(l => l.includes('Images/orphan.png') && l.includes('Drive') && l.includes('файл')),
  '(7) логът показва Images/orphan.png като изтрит от Drive', linesA);
ok(linesA.filter(l => l.includes('orphan.png')).length === 1,
  `(7) точно един ред за orphan.png (${JSON.stringify(linesA.filter(l => l.includes('orphan.png')))})`, linesA);
ok(linesA.filter(l => l.includes('loose.png')).length === 1, '(7) точно един ред за loose.png', linesA);
ok(linesA.some(l => l.includes('локалната папка') && l.includes('не е пипана')),
  `(8) без opener логът казва, че локалната папка не е пипана (${JSON.stringify(linesA)})`, linesA);
const summaryA = await setPage.evaluate(() => document.getElementById('orphan-media-log-summary').textContent);
ok(/Изтрити:/.test(summaryA) && /Drive:/.test(summaryA), `(8) обобщението е отгоре (${summaryA})`, summaryA);
ok(await setPage.evaluate(() => document.getElementById('orphan-media-logbox').style.display !== 'none'),
  '(8) логът остава на страницата');

// =====================================================================================
// (Б) Приложението отваря настройките: локалната папка се чисти през window.opener, а Drive
//     частта е същата. Приложението е реалното (main.js), затова се проверява и неговата част.
// =====================================================================================
drive = freshDrive();
deletes.length = 0;
const app = await ctx.newPage();
watch(app, 'app');
await app.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt|msm)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));
await app.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await app.waitForFunction(() => typeof orphanMediaLocalCleanup === 'function', null, { timeout: 20000 });

// Фалшива локална папка с Images, която помни какво е поискано да се изтрие. Връща се в изходно
// положение преди всяко триене, за да не си пречат двете проверки.
const seedApp = () => app.evaluate(() => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  window.__localRemoved = [];
  const files = new Set(['orphan.png', 'nono.png', 'alive.png', 'loose.png']);
  const images = {
    async removeEntry(name) {
      if (!files.has(name)) { const e = new Error('no such file'); e.name = 'NotFoundError'; throw e; }
      files.delete(name);
      window.__localRemoved.push(name);
    }
  };
  const rootHandle = {
    async getDirectoryHandle(name) {
      if (name === 'Images') return images;
      const e = new Error('no such directory'); e.name = 'NotFoundError'; throw e;
    },
    async removeEntry() { }
  };
  dirHandle = rootHandle;
  // Записът във паметта на приложението: функцията трябва да го махне оттам.
  mediaData.length = 0;
  mediaData.push({ datemod: 1, description: '', gdid: 'REC_ORPHAN', id: 17, noteid: 'NOTE_GONE', path: 'orphan.png', pathGD: 'IMG_ORPHAN', type: 1 });
});
await seedApp();

// Самата функция на приложението: ред в лога за записа и за файла, и махане от паметта.
const direct = await app.evaluate(async () => {
  const res = await orphanMediaLocalCleanup({ recordGdids: ['REC_ORPHAN'], imageNames: ['orphan.png', 'missing.png'] });
  return { res, stillInMemory: mediaData.some(m => m.gdid === 'REC_ORPHAN'), removed: window.__localRemoved.slice() };
});
ok(direct.res && Array.isArray(direct.res.log) && direct.res.log.length === 2,
  `(9) локалната функция връща по един ред за записа и за файла (${JSON.stringify(direct.res && direct.res.log)})`, direct.res);
ok(direct.res.log.every(r => r.where === 'local'), '(9) редовете казват, че са от локалната папка', direct.res.log);
ok(direct.res.log.some(r => r.kind === 'record' && /#17/.test(r.file) && r.ok === true),
  '(9) редът за записа е успешен и носи номера му', direct.res.log);
ok(direct.res.log.some(r => r.kind === 'file' && r.file === 'Images/orphan.png' && r.ok === true),
  '(9) редът за файла е успешен', direct.res.log);
ok(!direct.res.log.some(r => r.file.includes('missing.png')),
  '(9) липсващ локален файл не дава ред „изтрит“', direct.res.log);
ok(direct.stillInMemory === false, '(9) записът е махнат от паметта на приложението');

// Сега същото през самия бутон: настройките се отварят от приложението (има opener).
await seedApp(); // локалните файлове и записът отново са на мястото си
const [popup] = await Promise.all([
  ctx.waitForEvent('page'),
  app.evaluate(() => { window.open('/set.html', 'orphanwin'); })
]);
watch(popup, 'popup');
await popup.waitForLoadState('load');
await popup.waitForFunction(() => typeof initOrphanMediaCleanup === 'function', null, { timeout: 20000 });
deletes.length = 0;
await scanAndDelete(popup);
ok(deletes.length === 0, '(10) и тук сканирането не трие нищо', deletes);
await popup.click('#orphan-media-go');
await waitLog(popup);
const linesB = await logLines(popup);
const delB = deletes.slice();
ok(delB.includes('REC_ORPHAN') && delB.includes('IMG_ORPHAN') && delB.includes('IMG_LOOSE'),
  `(10) Drive частта е същата (${JSON.stringify(delB)})`, delB);
const localLines = linesB.filter(l => l.includes('локалната папка'));
ok(linesB.some(l => l.includes('Images/orphan.png') && l.includes('локалната папка') && l.includes('файл')),
  `(11) логът показва локалната папка като място на триене (${JSON.stringify(linesB)})`, linesB);
ok(linesB.some(l => l.includes('media.txt #17') && l.includes('локалната папка') && l.includes('запис')),
  '(11) логът показва и записа, изтрит от локалната папка', linesB);
ok(!linesB.some(l => l.includes('не е пипана')), '(11) няма ред „не е пипана“, когато opener има', linesB);
ok(linesB.filter(l => l.includes('orphan.png')).length === 2,
  `(11) orphan.png има точно два реда - Drive и локалната папка (${JSON.stringify(linesB.filter(l => l.includes('orphan.png')))})`, linesB);
ok(localLines.length >= 2, `(11) има редове от локалната папка (${JSON.stringify(localLines)})`, localLines);
const appAfter = await app.evaluate(() => ({ removed: window.__localRemoved.slice(), inMemory: mediaData.some(m => m.gdid === 'REC_ORPHAN') }));
ok(appAfter.removed.includes('orphan.png'), `(12) локалният Images/orphan.png е изтрит (${JSON.stringify(appAfter.removed)})`, appAfter);
ok(!appAfter.removed.includes('alive.png'), '(12) локалният файл на жива бележка остава', appAfter.removed);
ok(appAfter.inMemory === false, '(12) записът е махнат от паметта на приложението', appAfter);

ok(errs.length === 0, `няма нехванати грешки в конзолата (${JSON.stringify(errs.slice(0, 3))})`, errs.slice(0, 3));

// =====================================================================================
// (В) 390px: панелът и логът се побират в тесния екран.
// =====================================================================================
await setPage.setViewportSize({ width: 390, height: 800 });
const narrow = await setPage.evaluate(() => {
  const panel = document.getElementById('orphan-media-panel');
  const r = panel.getBoundingClientRect();
  const withPanel = document.documentElement.scrollWidth;
  // Колко е широка страницата БЕЗ панела: ако е същото, панелът не добавя хоризонтален скрол.
  const prev = panel.style.display;
  panel.style.display = 'none';
  const without = document.documentElement.scrollWidth;
  panel.style.display = prev;
  return { withPanel, without, left: Math.round(r.left), right: Math.round(r.right), visible: panel.offsetParent !== null };
});
ok(narrow.visible, '(13) панелът се вижда и на 390px', narrow);
ok(narrow.withPanel <= narrow.without, `(13) панелът не разширява страницата на 390px (${JSON.stringify(narrow)})`, narrow);
ok(narrow.left >= 0 && narrow.right <= 390, `(13) панелът се побира в 390px (${JSON.stringify(narrow)})`, narrow);

await browser.close();
srv.close();
console.log(`---- ${n - fails}/${n} проверки минават`);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('ALL PASS');
