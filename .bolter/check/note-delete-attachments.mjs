// Окончателното триене на бележка трие и прикачените ѝ: файловете от папка Images (в Drive и в
// локалната папка), записите им в media.txt и вградените в текста снимки. Докато бележката е в
// кошчето, нищо не се пипа.
// Собственик (24.10.2026): „Поправи окончателното изтриване на бележка: заедно с бележката да се
// трият и файловете на прикачените ѝ от папка Images (в Drive и в локалната папка) и записите им в
// media.txt, но само ако никоя друга жива бележка не ползва същия файл. При бележка в кошчето нищо
// да не се пипа."
// Собственик (24.10.2026, след PR #52) - ЗАМЯНА на проверките дали името се ползва другаде: „не
// искам никакви допълнителни проверки — гледаме във всички папки за приложения кои записи сочат към
// изтритата бележка и ги трием, толкова". Затова файл, чието име ползва друга бележка, бележка в
// кошчето или фон на борд, вече СЕ трие; оцелява само Drive копие с ДРУГО id на чужд запис.
// Собственик (24.10.2026, след това): „вградена снимка без запис" няма - затова по име в Drive не
// се търси НИКОГА (той изрично отхвърли всякаква проверка/търсене по име). nameLookups трябва да е
// празно във всеки случай; проверките, които очакваха търсене по име, са махнати.
// Проверяват се заявките, които наистина тръгват към Drive (DELETE по id), и какво остава в
// mediaData след триенето - тоест наблюдава се резултатът, не кодът.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/note-delete-attachments.mjs      (exit 1 при провалена проверка)
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
// deletes пази id-тата, за които приложението е поискало DELETE: това е единственото нещо, което
// наистина трие файл, значи по него се вижда какво е изчезнало.
const deletes = [];
// nameLookups пази имената, търсени в папка Images (q с name = '...'): търсенето по име връща ВСИЧКИ
// файлове с това име, затова по него се вижда дали приложението е посегнало към чуждо копие.
const nameLookups = [];
const FOLDER_IMAGES = 'FOLDER_IMAGES', FOLDER_DATA = 'FOLDER_DATA';
// Файлове в папка Images по име. Приложението НЕ бива да търси по име; ако все пак го направи, тези
// файлове щяха да се намерят и изтрият, а nameLookups го хваща.
const BY_NAME = {
  'inlineA.png': [{ id: 'IMG_INLINE_A', name: 'inlineA.png', modifiedTime: '2026-10-24T08:00:00Z' }],
  'inlineB.png': [{ id: 'IMG_INLINE_B', name: 'inlineB.png', modifiedTime: '2026-10-24T08:00:00Z' }],
  'inlineKeep.png': [{ id: 'IMG_INLINE_KEEP', name: 'inlineKeep.png', modifiedTime: '2026-10-24T08:00:00Z' }],
  // Две копия с едно име: на изтриваната и на друга жива бележка - търсене по име връща и двете.
  'mixed.png': [{ id: 'IMG_MIXED_FOREIGN', name: 'mixed.png', modifiedTime: '2026-10-24T09:00:00Z' },
                { id: 'IMG_MIXED_OWN', name: 'mixed.png', modifiedTime: '2026-10-24T08:00:00Z' }],
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  // 1. Самото изтриване на файл: точно това се брои за „файлът е изтрит от Drive".
  const del = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)$/);
  if (del && method === 'DELETE') {
    const id = decodeURIComponent(del[1]);
    deletes.push(id);
    return route.fulfill({ status: 204, body: '' });
  }
  // 2. Запис на съдържание (PATCH) - в кошчето и при възстановяване бележката само се обновява.
  if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'PATCHED' }) });
  }
  // 3. Метаданни на файл (thumbnailLink) - не се чака тук, но да не гърми.
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: 'https://thumb.invalid/x=s400' }) });
  if (url.startsWith('https://thumb.invalid/')) {
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#c6d2e4"/></svg>' });
  }
  // 4. Списъци в Drive: папка по име, файл по име (findGDFileByNameDetailed), създаване на файл.
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    if (method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'CREATED_FILE_ID' }) });
    }
    const q = new URL(url).searchParams.get('q') || '';
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
      const id = name === 'Images' ? FOLDER_IMAGES : (name === 'multinotes_data' ? FOLDER_DATA : 'FOLDER_' + name);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id, name }] }) });
    }
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    if (q.includes(FOLDER_IMAGES) && name) nameLookups.push(name);
    const files = q.includes(FOLDER_IMAGES) ? (BY_NAME[name] || []) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  if (url.startsWith('https://storage.ko-fi.com/')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});

const page = await ctx.newPage();
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt|msm)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await ctx.addInitScript(() => {
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
  localStorage.setItem('language', 'bg');
  localStorage.setItem('lang', 'bg');
  window.gapi = {
    load() { },
    client: {
      setToken() { }, getToken() { return { access_token: 'tok' }; },
      drive: { files: { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); } } },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
// Помощникът за прикачените НЕ се изисква тук: на стария код той липсва, а проверката трябва да
// падне по СЪЩЕСТВО (файловете остават), не защото някое име не се намира.
await page.waitForFunction(() => typeof permanentlyDeleteNote === 'function'
  && typeof moveNoteToTrash === 'function' && typeof moveNoteToBoard === 'function', null, { timeout: 20000 });

// --- Минималното състояние, което пътищата на триенето очакват (без логин и без startApp) ---
await page.evaluate(() => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dbNoteIdTypeGlobal = 'gdid'; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  folderIds.Images = 'FOLDER_IMAGES';
  localStorage.setItem('gdrive_folder_id_Images', 'FOLDER_IMAGES');
  localStorage.setItem('updateLocalFolder', 'false'); // локалната папка не се ползва в тази проверка
});

const BOARD = { gdid: 'BOARD_MAIN', id: 1, title: 'Main', status: 0, numord: 1 };
const noteObj = (gdid, id, opts = {}) => ({
  alarm_type: -1, boardid: opts.boardid || 'BOARD_MAIN', calendarDate: 0, color: 0,
  date: Date.now(), datemod: Date.now(), eventId: 0, gdid, id,
  notetxt: opts.text || 'Текст на бележката', numord: id, sellist: 0, status: opts.status || 0,
  text_span: opts.inline ? JSON.stringify({ start: 0, end: 1, type: 8, paramstring: opts.inline, paramint: 10 }) : '',
  title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1,
});
const mediaObj = (gdid, id, noteid, name, pathGD) => ({
  datemod: Date.now(), description: '', gdid, id, noteid, path: name, pathGD, type: 1,
});

const seed = (notes, media, boards) => page.evaluate(({ notes, media, boards }) => {
  allNotesData.length = 0;
  mediaData.length = 0;
  boardsData.length = 0;
  for (const nt of notes) allNotesData.push(nt);
  for (const m of media) mediaData.push(m);
  for (const b of (boards || [])) boardsData.push(b);
  inlineImageFileCache.clear(); inlineImageThumbCache.clear(); inlineImageBlobCache.clear();
}, { notes, media, boards });

const state = () => page.evaluate(() => ({
  notes: allNotesData.map(nt => ({ gdid: nt.gdid, id: nt.id, status: nt.status })),
  media: mediaData.map(m => ({ gdid: m.gdid, id: m.id, noteid: m.noteid, path: m.path, pathGD: m.pathGD })),
}));
const deleted = () => deletes.slice();
// Фалшива локална папка: dirHandle с подпапка Images, която записва какво е поискано да се изтрие.
const useFakeLocalFolder = () => page.evaluate(() => {
  window.__localRemoved = [];
  const images = { async removeEntry(name) { window.__localRemoved.push(name); } };
  dirHandle = { async getDirectoryHandle(name) { if (name === INLINE_IMAGE_FOLDER) return images; throw new DOMException('', 'NotFoundError'); } };
});
const localRemoved = () => page.evaluate(() => (window.__localRemoved || []).slice());
const dropFakeLocalFolder = () => page.evaluate(() => { dirHandle = null; });

// =====================================================================================
// (а) Бележка със собствен прикачен файл и с вградена в текста снимка - окончателно триене.
// =====================================================================================
await seed(
  [noteObj('NOTEA_GID_0000001', 101, { text: 'Бележка със снимка * в текста', inline: '/Images/inlineA.png' })],
  [mediaObj('MEDIA_REC_A_1', 9001, 'NOTEA_GID_0000001', 'onlyA.png', 'IMG_ONLY_A')],
  [BOARD]);
deletes.length = 0;
const resA = await page.evaluate(() => permanentlyDeleteNote('NOTEA_GID_0000001', 101, true));
const afterA = await state();
ok(resA && resA.ok === true, `(а) бележката е изтрита окончателно (${JSON.stringify(resA)})`, resA);
ok(!afterA.notes.some(nt => nt.gdid === 'NOTEA_GID_0000001'), '(а) бележката я няма в паметта', afterA.notes);
ok(deleted().includes('NOTEA_GID_0000001'), `(а) изтрит е файлът на бележката в Drive (${JSON.stringify(deleted())})`, deleted());
ok(deleted().includes('MEDIA_REC_A_1'), '(а) изтрит е файлът-ЗАПИС на прикачения в media.txt (в Drive)', deleted());
ok(deleted().includes('IMG_ONLY_A'), '(а) изтрит е файлът на прикачения от папка Images (по pathGD)', deleted());
// Търсенето на вградената снимка по име е махнато (собственикът: вградена снимка без запис няма).
ok(!deleted().includes('IMG_INLINE_A'), '(а) вградената снимка без запис НЕ се търси и не се трие по име', deleted());
ok(!afterA.media.some(m => m.gdid === 'MEDIA_REC_A_1'), '(а) записът е махнат от mediaData (media.txt)', afterA.media);

// Същият път, но през самия помощник - за да се види отчетът, който отива в конзолата.
await seed(
  [noteObj('NOTEB_GID_0000002', 102, { text: 'Бележка *', inline: '/Images/inlineB.png' })],
  [mediaObj('MEDIA_REC_B_1', 9002, 'NOTEB_GID_0000002', 'onlyB.png', 'IMG_ONLY_B')],
  [BOARD]);
deletes.length = 0;
const reportB = await page.evaluate(() => (typeof deleteNoteAttachmentFiles === 'function'
  ? deleteNoteAttachmentFiles('NOTEB_GID_0000002', 102)
  : null));
ok(reportB && reportB.records === 1 && reportB.files === 1 && !('kept' in reportB),
  `(а) отчетът на помощника: 1 запис, 1 файл (само по id), без поле kept (${JSON.stringify(reportB)})`, reportB);

// =====================================================================================
// (б) Същият файл, прикачен към две бележки. Всяко прикачване качва файла в Drive НАНОВО
//     (uploadBlobToGDrive, без дедупликация), така че двете бележки имат ОТДЕЛНИ копия с еднакво
//     име и различен pathGD. Копието на изтритата бележка се трие по собственото си id; копието
//     на Б остава, защото е на записа на Б и не влиза в списъка. Собственикът изрично поиска БЕЗ
//     проверки дали името се ползва другаде, затова локалният Images/shared.png вече СЕ трие.
//     По име в Drive не се търси - записът на А има id.
// =====================================================================================
await seed(
  [noteObj('NOTEA2_GID_0000003', 103, { text: 'А ползва shared.png' }),
   noteObj('NOTEB2_GID_0000004', 104, { text: 'Б също ползва shared.png' })],
  [mediaObj('MEDIA_REC_A2_1', 9101, 'NOTEA2_GID_0000003', 'shared.png', 'IMG_SHARED_A'),
   mediaObj('MEDIA_REC_B2_1', 9102, 'NOTEB2_GID_0000004', 'shared.png', 'IMG_SHARED_B')],
  [BOARD]);
deletes.length = 0; // nameLookups не се нулира: в края се проверява, че е празно за всички случаи
await useFakeLocalFolder();
await page.evaluate(() => permanentlyDeleteNote('NOTEA2_GID_0000003', 103, true));
const afterB = await state();
const localShared = await localRemoved();
await dropFakeLocalFolder();
ok(deleted().includes('IMG_SHARED_A'),
  `(б) собственото Drive копие на изтритата бележка СЕ трие (${JSON.stringify(deleted())})`, deleted());
ok(!deleted().includes('IMG_SHARED_B'), '(б) копието на другата бележка НЕ се трие', deleted());
ok(!nameLookups.includes('shared.png'), '(б) по име в Drive не се търси - записът има id', nameLookups);
// Без проверки (изричното искане на собственика): локалният файл се трие, макар Б да сочи същото име.
ok(localShared.includes('shared.png'), `(б) локалният Images/shared.png СЕ трие (${JSON.stringify(localShared)})`, localShared);
ok(deleted().includes('MEDIA_REC_A2_1'), '(б) записът на изтритата бележка се маха', deleted());
ok(!deleted().includes('MEDIA_REC_B2_1'), '(б) записът на другата бележка остава', deleted());
ok(afterB.media.some(m => m.gdid === 'MEDIA_REC_B2_1') && !afterB.media.some(m => m.gdid === 'MEDIA_REC_A2_1'),
  '(б) в media.txt остава само записът на другата бележка', afterB.media);

// (б2) Две копия на един файл, прикачени към ЕДНА бележка (два записа, еднакво име, различен
//      pathGD): и двете копия са нейни и се трият.
await seed(
  [noteObj('NOTEDUP_GID_0000011', 111, { text: 'два пъти twice.png' })],
  [mediaObj('MEDIA_REC_DUP_1', 9501, 'NOTEDUP_GID_0000011', 'twice.png', 'IMG_TWICE_1'),
   mediaObj('MEDIA_REC_DUP_2', 9502, 'NOTEDUP_GID_0000011', 'twice.png', 'IMG_TWICE_2')],
  [BOARD]);
deletes.length = 0;
await useFakeLocalFolder();
await page.evaluate(() => permanentlyDeleteNote('NOTEDUP_GID_0000011', 111, true));
const afterDup = await state();
const localDup = await localRemoved();
await dropFakeLocalFolder();
ok(deleted().includes('IMG_TWICE_1') && deleted().includes('IMG_TWICE_2'),
  `(б2) и двете копия на бележката се трият (${JSON.stringify(deleted())})`, deleted());
ok(!afterDup.media.some(m => m.noteid === 'NOTEDUP_GID_0000011'), '(б2) и двата записа изчезват от mediaData', afterDup.media);
ok(localDup.includes('twice.png'), `(б2) локалният Images/twice.png се трие (${JSON.stringify(localDup)})`, localDup);

// (б3) Друга ЖИВА бележка има прикачен файл със същото име (path) и свой pathGD: копието на
//      изтриваната се трие по id, копието на другата остава (друго id, чужд запис). Собственикът
//      изрично поиска БЕЗ проверки, затова локалният Images/mixed.png вече СЕ трие. По име не се
//      търси, защото записът има id - търсенето би върнало и чуждото копие.
await seed(
  [noteObj('NOTEMIX_GID_0000012', 112, { text: 'прикачен mixed.png' }),
   noteObj('NOTEOTH_GID_0000013', 113, { text: 'и тази има mixed.png' })],
  [mediaObj('MEDIA_REC_MIX_1', 9601, 'NOTEMIX_GID_0000012', 'mixed.png', 'IMG_MIXED_OWN'),
   mediaObj('MEDIA_REC_OTH_1', 9602, 'NOTEOTH_GID_0000013', 'mixed.png', 'IMG_MIXED_FOREIGN')],
  [BOARD]);
deletes.length = 0; // nameLookups не се нулира: в края се проверява, че е празно за всички случаи
await useFakeLocalFolder();
await page.evaluate(() => permanentlyDeleteNote('NOTEMIX_GID_0000012', 112, true));
const localMix = await localRemoved();
await dropFakeLocalFolder();
ok(deleted().includes('IMG_MIXED_OWN'), `(б3) собственото копие се трие по id (${JSON.stringify(deleted())})`, deleted());
ok(!deleted().includes('IMG_MIXED_FOREIGN'), '(б3) копието на другата бележка НЕ се трие', deleted());
ok(localMix.includes('mixed.png'), `(б3) локалният Images/mixed.png СЕ трие - без проверки (${JSON.stringify(localMix)})`, localMix);
ok(nameLookups.length === 0, `(б3) няма никакво търсене по име (${JSON.stringify(nameLookups)})`, nameLookups);

// =====================================================================================
// (в) Бележка в кошчето: нищо не се пипа, а след възстановяване прикачените са там.
// =====================================================================================
await seed(
  [noteObj('NOTEC_GID_0000005', 105, { text: 'Бележка за кошчето *', inline: '/Images/trashC.png' })],
  [mediaObj('MEDIA_REC_C_1', 9201, 'NOTEC_GID_0000005', 'trashC.png', 'IMG_TRASH_C')],
  [BOARD]);
deletes.length = 0;
const movedToTrash = await page.evaluate(() => moveNoteToTrash('NOTEC_GID_0000005', 105, { batch: true }));
const inTrash = await state();
ok(movedToTrash === true, '(в) бележката е преместена в кошчето');
ok(inTrash.notes.some(nt => nt.gdid === 'NOTEC_GID_0000005' && nt.status === 1), '(в) бележката е със status=1', inTrash.notes);
ok(deleted().length === 0, `(в) при влизане в кошчето НИЩО не се трие (${JSON.stringify(deleted())})`, deleted());
ok(inTrash.media.some(m => m.gdid === 'MEDIA_REC_C_1'), '(в) записът на прикачения остава', inTrash.media);
const restored = await page.evaluate(() => moveNoteToBoard('NOTEC_GID_0000005', 105, 'BOARD_MAIN', { batch: true }));
const afterRestore = await state();
ok(restored === true && afterRestore.notes.some(nt => nt.gdid === 'NOTEC_GID_0000005' && nt.status === 0),
  '(в) бележката се възстановява от кошчето', afterRestore.notes);
ok(afterRestore.media.some(m => m.gdid === 'MEDIA_REC_C_1' && m.path === 'trashC.png'),
  '(в) след възстановяване прикаченият файл е на мястото си', afterRestore.media);
ok(deleted().length === 0, `(в) и при възстановяването нищо не се трие (${JSON.stringify(deleted())})`, deleted());

// =====================================================================================
// (г) Бележка в кошчето с файл със същото име НЕ пази файловете на изтриваната: собственикът
//     изрично поиска без проверки. Оцелява само копието на бележката в кошчето (друго id, неин запис).
// =====================================================================================
await seed(
  [noteObj('NOTED_TRASH_0000006', 106, { status: 1, text: 'в кошчето: keepMe.png' }),
   noteObj('NOTEE_GID_0000007', 107, { text: 'жива бележка' }),
   noteObj('NOTET_TRASH_IMG_0008', 108, { status: 1, text: 'в кошчето със снимка *', inline: '/Images/inlineKeep.png' }),
   noteObj('NOTEU_GID_0000009', 109, { text: 'жива бележка със снимка *', inline: '/Images/inlineKeep.png' })],
  [mediaObj('MEDIA_REC_D_1', 9301, 'NOTED_TRASH_0000006', 'keepMe.png', 'IMG_KEEP_D'),
   mediaObj('MEDIA_REC_E_1', 9302, 'NOTEE_GID_0000007', 'keepMe.png', 'IMG_KEEP_E'),
   // Вградената снимка е прикачен файл на същата бележка, значи бележката в кошчето има запис за нея.
   mediaObj('MEDIA_REC_T_1', 9303, 'NOTET_TRASH_IMG_0008', 'inlineKeep.png', 'IMG_INLINE_KEEP_T')],
  [BOARD]);
deletes.length = 0;
await page.evaluate(() => permanentlyDeleteNote('NOTEE_GID_0000007', 107, true));
const afterG = await state();
// Бележката в кошчето има СВОЕ копие (IMG_KEEP_D) с друго id - то не е в списъка; копието на изтритата се трие.
ok(!deleted().includes('IMG_KEEP_D'), `(г) копието на бележката в кошчето (друго id) остава (${JSON.stringify(deleted())})`, deleted());
ok(deleted().includes('IMG_KEEP_E'), '(г) собственото копие на изтритата бележка се трие', deleted());
ok(deleted().includes('MEDIA_REC_E_1'), '(г) записът на изтритата бележка се маха', deleted());
ok(afterG.media.some(m => m.gdid === 'MEDIA_REC_D_1'), '(г) записът на бележката в кошчето остава', afterG.media);

deletes.length = 0;
await page.evaluate(() => permanentlyDeleteNote('NOTEU_GID_0000009', 109, true));
// Проверката „вградената снимка се трие по име" е махната: по име не се търси (изричното искане на собственика).
ok(deleted().includes('NOTEU_GID_0000009'), '(г) самата бележка пак се трие', deleted());

// =====================================================================================
// (д) Фонът на борд не пази файла: собственикът изрично поиска без проверки, затова прикаченият
//     файл на бележката се трие, дори борд да го ползва за фон (backpath е id на файла в Drive).
// =====================================================================================
await seed(
  [noteObj('NOTEF_GID_0000010', 110, { text: 'бележка с фон на борд' })],
  [mediaObj('MEDIA_REC_F_1', 9401, 'NOTEF_GID_0000010', 'boardBg.png', 'IMG_BOARD_BG')],
  [Object.assign({}, BOARD, { backpath: 'IMG_BOARD_BG' })]);
deletes.length = 0;
await page.evaluate(() => permanentlyDeleteNote('NOTEF_GID_0000010', 110, true));
ok(deleted().includes('IMG_BOARD_BG'), `(д) файлът СЕ трие, макар да е фон на борд (${JSON.stringify(deleted())})`, deleted());
ok(deleted().includes('MEDIA_REC_F_1'), '(д) записът на бележката пак се маха', deleted());

ok(nameLookups.length === 0, `никъде не се търси по име в Drive (${JSON.stringify(nameLookups)})`, nameLookups);
ok(errs.length === 0, `няма нехванати грешки в конзолата (${JSON.stringify(errs.slice(0, 3))})`, errs.slice(0, 3));

await browser.close();
srv.close();
console.log(`---- ${n - fails}/${n} проверки минават`);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('ALL PASS');
