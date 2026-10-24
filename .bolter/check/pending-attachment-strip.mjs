// Прикачен файл влиза в лентата ВЕДНАГА - още докато се качва и преди бележката да е записана.
// Проверява това, което собственикът поиска (24.10.2026): „когато прикачим снимка, тя да се визуализира
// в лентата с икони, за да може да я добавяме в текста... всички приложени файлове да са достъпни
// веднага след записването и още преди затваряне на бележката".
// Досега плочката и съобщението „Прикачено" излизаха чак след като бележката получи gdid, а той идва
// само при запис. Затова проверката държи отговора на качването затворен (uploadGate) и иска плочката
// и „Сложи в текста" да работят, докато качването още тече. След това бележката получава gdid и
// плочката трябва да остане точно една, вече без белега „чакаща".
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/pending-attachment-strip.mjs      (exit 1 при провалена проверка)
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

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });

// --- Качването се държи затворено, докато проверката не го пусне ---
// Така „плочката я има, докато файлът още се качва" е истинско наблюдение, а не надпревара с мрежата.
let releaseUpload = () => { };
const uploadGate = new Promise(resolve => { releaseUpload = resolve; });
let uploadPosts = 0;
const FOLDER_IMAGES = 'FOLDER_IMAGES', FOLDER_DATA = 'FOLDER_DATA';
const NEW_NAME = 'NovaSnimka.png', NEW_ID = 'NEWPHOTO';
// Файл, който вече е качен: по него се търси името, след като качването мине.
const BY_NAME = () => ({ [NEW_NAME]: [{ id: NEW_ID, name: NEW_NAME, modifiedTime: '2026-10-24T08:00:00Z' }] });

// Малка истинска PNG картинка (1x1) - <img> я зарежда от blob адреса.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const url = route.request().url();
  const method = route.request().method();
  // Качване на самия файл: отговорът се държи до пускането на проверката.
  if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
    if (method === 'POST') {
      uploadPosts++;
      await uploadGate;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: NEW_ID }) });
    }
    // PATCH - записът в media.txt.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'MEDIA_NEW' }) });
  }
  // Създаване на подпапка по тип (Images/Sound/Video) - ако някъде се поиска.
  if (url === 'https://www.googleapis.com/drive/v3/files' && method === 'POST') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: FOLDER_IMAGES, name: 'Images' }) });
  }
  // Метаданни на файл: thumbnailLink.
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s400` }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c6d2e4"/></svg>';
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  if (url.startsWith('https://storage.ko-fi.com/')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  }
  // Списъците в Drive: папка по име (Images, multinotes_data) и файл по име.
  if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
    const q = new URL(url).searchParams.get('q') || '';
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
      const id = name === 'Images' ? FOLDER_IMAGES : (name === 'multinotes_data' ? FOLDER_DATA : 'FOLDER_' + name);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id, name }] }) });
    }
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: BY_NAME()[name] || [] }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});

const page = await ctx.newPage();
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

// Drive се чете с fetch и токен от storage (gapi.client.drive не се вика) - токенът се слага преди
// зареждането, както в type8-inline-image.mjs.
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
await page.waitForFunction(() => typeof showModal === 'function' && typeof attachFilesToModal === 'function'
  && typeof buildNoteAttachmentStrip === 'function', null, { timeout: 20000 });

// --- Минималното състояние, което рендерът очаква (без логин и без startApp) ---
await page.evaluate(() => {
  contentModal = document.getElementById('content-modal');
  modalBody = document.getElementById('modal-body');
  copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  localStorage.setItem('oneTapLink', 'true');
  // Папките са известни: не се иска създаване, качването тръгва веднага.
  folderIds.Images = 'FOLDER_IMAGES';
  localStorage.setItem('gdrive_folder_id_Images', 'FOLDER_IMAGES');
  window.__opened = [];
  window.open = (u) => { window.__opened.push(String(u)); return null; };
});

// --- Нова бележка, както я прави приложението: временно id, без gdid, веднага в редакция ---
const NOTE_ID = 902;
await page.evaluate((noteId) => {
  showModal({ raw: '', format: '', gdid: '', id: noteId, numord: noteId, isNewNote: true });
  const body = document.getElementById('modal-body');
  enableNoteEditing(body);
  const box = body.closest('.modal-content-box');
  box.style.height = '660px';
  box.style.maxHeight = '660px';
}, NOTE_ID);

// Редакторът е готов, когато лентата (с плочката „+") е на екрана.
await page.waitForFunction(() => {
  const body = document.getElementById('modal-body');
  return body && body.classList.contains('nm-edit-with-strip') && !!body.querySelector('.nm-attach-strip .nm-attach-tile.is-add')
    && !!document.getElementById('note-edit-textarea');
}, null, { timeout: 15000 });

const stripState = () => page.evaluate(() => {
  const body = document.getElementById('modal-body');
  const strip = body.querySelector('.nm-attach-strip');
  const tiles = strip ? [...strip.querySelectorAll('.nm-attach-tile:not(.is-add)')] : [];
  const toast = document.getElementById('toastNotification');
  const menu = document.querySelector('.nm-inline-menu');
  const field = document.getElementById('note-edit-textarea');
  return {
    stripShown: !!strip,
    editMode: body.classList.contains('nm-edit-with-strip'),
    addTile: !!body.querySelector('.nm-attach-strip .nm-attach-tile.is-add'),
    tiles: tiles.map(t => ({
      name: t.dataset.nmFileName || null,
      pending: t.dataset.nmPending === '1',
      cls: t.className,
      state: t.dataset.state,
      opacity: getComputedStyle(t).opacity,
      borderStyle: getComputedStyle(t).borderTopStyle,
      img: (t.querySelector('.nm-attach-tile-photo img') || {}).src || null,
      hasLink: !!t.parentElement.querySelector('.nm-attach-source a'),
    })),
    toast: toast ? toast.textContent : '',
    menuRows: menu ? [...menu.querySelectorAll('.nm-inline-menu-row')].map(r => r.textContent.trim()) : null,
    value: field ? field.value : null,
    formats: field ? (body.dataset.format || '').split('|').filter(Boolean).map(s => JSON.parse(s)) : [],
    noteSaved: allNotesData.some(n => String(n.id) === String(body.dataset.id) && n.gdid && String(n.gdid).length > 10),
    pendingKeys: [...pendingNoteAttachments.keys()],
    pendingCount: [...pendingNoteAttachments.values()].reduce((a, l) => a + l.length, 0),
    mediaCount: mediaData.filter(m => m.path === 'NovaSnimka.png').length,
  };
});

const before = await stripState();
ok(before.stripShown && before.addTile, `нова бележка в редакция: лентата е на екрана с плочката „+" (${before.stripShown}/${before.addTile})`);
ok(before.tiles.length === 0, `преди прикачването в лентата няма плочки (${before.tiles.length})`);
ok(!before.noteSaved, 'бележката още не е записана (няма gdid) - точно състоянието, в което старата проверка чакаше');

// --- Прикачване на снимка през истинското поле за избор на файл ---
// Отговорът на качването стои затворен, значи всичко по-долу се случва ПРЕДИ качването да е свършило.
await page.setInputFiles('#modal-attach-image-input', { name: NEW_NAME, mimeType: 'image/png', buffer: PNG });

const tileAppeared = await page.waitForFunction(() => {
  const strip = document.querySelector('#modal-body .nm-attach-strip');
  return !!strip && !!strip.querySelector('.nm-attach-tile:not(.is-add)');
}, null, { timeout: 8000 }).then(() => true).catch(() => false);
const during = await stripState();
ok(tileAppeared, 'плочката за прикачения файл се появи в лентата, без бележката да е записана');
ok(uploadPosts === 1, `качването е поискано и още НЕ е отговорено (заявки: ${uploadPosts})`);
ok(during.tiles.length === 1 && during.tiles[0].name === NEW_NAME,
  `плочката е на прикачения файл (${JSON.stringify(during.tiles.map(t => t.name))})`);
ok(during.tiles[0].pending === true && during.tiles[0].cls.includes('is-pending'),
  `чакащата плочка е отбелязана (${during.tiles[0].cls})`);
ok(Number(during.tiles[0].opacity) < 1 && during.tiles[0].borderStyle === 'dashed',
  `чакащата плочка изглежда приглушена и с пунктир (${during.tiles[0].opacity}/${during.tiles[0].borderStyle})`);
ok(during.tiles[0].state !== 'missing', `чакащата плочка не изпада в „липсващ файл" (${during.tiles[0].state})`);
// Снимката идва от паметта: <img> е с blob адрес, а състоянието става „готова", щом се зареди.
const thumbReady = await page.waitForFunction(() => {
  const t = document.querySelector('#modal-body .nm-attach-strip .nm-attach-tile:not(.is-add)');
  const img = t && t.querySelector('.nm-attach-tile-photo img');
  return !!img && String(img.src).startsWith('blob:') && t.dataset.state === 'ready';
}, null, { timeout: 5000 }).then(() => true).catch(() => false);
ok(thumbReady, 'снимката в плочката се показва веднага от паметта, без да се пита Drive');
ok(!during.tiles[0].cls.includes('is-missing'), 'чакащата плочка не изпада в „липсващ файл"');
ok(!during.noteSaved, 'бележката още не е записана - плочката не чака запис');
ok(!/Прикачено/.test(during.toast), `съобщението „Прикачено" още не е излязло, докато качването тече (${JSON.stringify(during.toast)})`);

// --- Плочката е готова за работа веднага: кликът отваря менюто с „Сложи в текста" ---
await page.click('#modal-body .nm-attach-strip .nm-attach-tile:not(.is-add)');
const menuOpen = await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 4000 })
  .then(() => true).catch(() => false);
const withMenu = await stripState();
ok(menuOpen, 'кликът върху чакащата плочка отваря менюто на снимката');
ok((withMenu.menuRows || []).includes('Сложи в текста'),
  `менюто предлага „Сложи в текста" още преди запис (${JSON.stringify(withMenu.menuRows)})`);

// И снимката наистина влиза в текста - маркерът и записът type=8 се появяват в редактора.
await page.evaluate(() => {
  const field = document.getElementById('note-edit-textarea');
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
});
await page.click('.nm-inline-menu-row[data-nm-menu-action="insert"]');
const inserted = await page.waitForFunction((name) => {
  const body = document.getElementById('modal-body');
  const field = document.getElementById('note-edit-textarea');
  if (!field || !field.value.includes('*')) return false;
  return (body.dataset.format || '').split('|').filter(Boolean).map(s => JSON.parse(s))
    .some(f => f.type === 8 && String(f.paramstring || '').split('/').pop() === name);
}, NEW_NAME, { timeout: 8000 }).then(() => true).catch(() => false);
const afterInsert = await stripState();
ok(inserted, `„Сложи в текста" вкара снимката в текста преди запис (текст: ${JSON.stringify(afterInsert.value)}, записи: ${JSON.stringify(afterInsert.formats.filter(f => f.type === 8))})`);

// --- Качването свършва: съобщението излиза тук, а не след запис на бележката ---
releaseUpload();
const toastShown = await page.waitForFunction(() => /Прикачено/.test(document.getElementById('toastNotification').textContent), null, { timeout: 8000 })
  .then(() => true).catch(() => false);
const afterUpload = await stripState();
ok(toastShown, `съобщението за прикачване излиза веднага след качването (${JSON.stringify(afterUpload.toast)})`);
ok(afterUpload.toast.includes(NEW_NAME), `съобщението назовава файла (${JSON.stringify(afterUpload.toast)})`);
ok(!afterUpload.noteSaved, 'това става, без бележката да е записана - старият ред чакаше точно това');
ok(afterUpload.tiles.length === 1, `плочката е все още точно една (${afterUpload.tiles.length})`);
ok(afterUpload.pendingCount === 1 && afterUpload.mediaCount === 0,
  `файлът чака свързването със записа (чакащи: ${afterUpload.pendingCount}, записи в mediaData: ${afterUpload.mediaCount})`);

// --- Бележката получава gdid (при запис това го прави saveEditedNote) ---
// Свързването върви във фонов режим: чака gdid, създава записа в media.txt и маха чакащата плочка.
await page.evaluate((noteId) => {
  const body = document.getElementById('modal-body');
  const note = {
    alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
    gdid: 'NEWG1ABCDEFG', id: noteId, notetxt: body.dataset.rawText || '', numord: noteId, sellist: 0,
    status: 0, text_span: body.dataset.format || '', title_span: '', timer: 0, timer_type: -1,
    timer_val: 1, type: 0, uiState: {}, version: 1,
  };
  allNotesData.push(note);
  body.dataset.gdid = note.gdid;
}, NOTE_ID);

const linked = await page.waitForFunction(() => {
  const strip = document.querySelector('#modal-body .nm-attach-strip');
  const tiles = strip ? [...strip.querySelectorAll('.nm-attach-tile:not(.is-add)')] : [];
  return tiles.length === 1 && tiles[0].dataset.nmPending !== '1'
    && mediaData.some(m => m.path === 'NovaSnimka.png' && m.noteid === 'NEWG1ABCDEFG');
}, null, { timeout: 10000 }).then(() => true).catch(() => false);
const final = await stripState();
ok(linked, 'след като бележката получи gdid, файлът се свързва сам със записа (запис в mediaData)');
ok(final.tiles.length === 1, `плочката остава точно една - без дубликат при предаването (${final.tiles.length})`);
ok(final.tiles[0].pending === false && !final.tiles[0].cls.includes('is-pending'),
  `белегът „чакаща" е свален (${final.tiles[0].cls})`);
ok(final.pendingCount === 0 && final.pendingKeys.length === 0, `списъкът с чакащи е изчистен (${JSON.stringify(final.pendingKeys)})`);
ok(final.tiles[0].state === 'ready', `плочката показва снимката и след свързването (${final.tiles[0].state})`);
ok(final.tiles[0].hasLink, 'плочката вече има истинския линк на файла от Drive');
ok(final.addTile, 'плочката „+" остава в лентата');
const editorAlive = await page.evaluate(() => !!document.getElementById('note-edit-textarea'));
ok(editorAlive, 'редакторът не е затворен от преизграждането на лентата');

// Еднократно преизграждане на лентата (напр. опресняване на бележката) не удвоява плочката.
await page.evaluate(() => rebuildEditAttachmentStrip());
const rebuilt = await stripState();
ok(rebuilt.tiles.length === 1, `преизградената лента пак показва една плочка (${rebuilt.tiles.length})`);

// --- Запис на бележката: бележката минава в режим четене ---
// Собственикът иска файловете да са на разположение и след записа, без да се затваря и отваря бележката.
await page.evaluate((noteId) => {
  const body = document.getElementById('modal-body');
  disableNoteEditing(body);
  showModal({ raw: '*', format: body.dataset.format || '', gdid: 'NEWG1ABCDEFG', id: noteId });
}, NOTE_ID);
const readStrip = await page.waitForFunction(() => {
  const body = document.getElementById('modal-body');
  const strip = body.querySelector('.nm-attach-strip');
  const tiles = strip ? [...strip.querySelectorAll('.nm-attach-tile:not(.is-add)')] : [];
  return !body.classList.contains('nm-edit-with-strip') && tiles.length === 1 && tiles[0].dataset.state === 'ready';
}, null, { timeout: 10000 }).then(() => true).catch(() => false);
const inRead = await stripState();
ok(readStrip, 'след записа лентата в режим четене показва прикачения файл, без да се отваря бележката наново');
ok(inRead.tiles.length === 1 && inRead.tiles[0].pending === false,
  `в режим четене плочката е на свързания запис, не чакаща (${inRead.tiles.length}, ${inRead.tiles[0] && inRead.tiles[0].pending})`);
ok(inRead.tiles[0].hasLink, 'плочката в режим четене има истинския линк на файла');

ok(errs.length === 0, `няма нехванати грешки в конзолата (${JSON.stringify(errs.slice(0, 3))})`);

await browser.close();
srv.close();
console.log(`---- ${n - fails}/${n} проверки минават`);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('ALL PASS');
