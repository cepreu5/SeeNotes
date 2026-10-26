// X върху плочката на прикачен файл в модала: жив браузър (Playwright + Chromium).
// Проверява това, което собственикът поиска (26.10.2026):
//   • X стои на ВСЯКА плочка на файл (1..4) и ВИНАГИ - не само при задържане; на type=5 (място) няма;
//   • X е span с role=button и tabindex=0, не вложен <button>;
//   • натискането му НЕ отваря файла и не стига до плочката;
//   • „Отказ" не пипа нищо; „Да" маха плочката, записа в media.txt (и от Drive), файла в Drive и
//     вградената снимка от текста (в редакция - от полето, с изместени формати).
// Пускане от корена на хранилището: node .bolter/check/attach-delete-x.mjs   (exit 1 при провал)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs',
    'playwright'
].find(p => p === 'playwright' || existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = ['/opt/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome']
    .find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
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
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
// Всичко извън localhost се отбива: до Drive не се стига.
const GSI = 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};';
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    const body = url.startsWith('https://accounts.google.com/gsi/client') ? GSI : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
});
const page = await ctx.newPage();
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.addInitScript(() => {
    sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof buildAttachmentTile === 'function'
    && typeof nmDeleteNoteAttachment === 'function', null, { timeout: 25000 });

// --- Минималното състояние, което рендерът очаква (без логин и без startApp) ---
await page.evaluate(() => {
    contentModal = document.getElementById('content-modal');
    modalBody = document.getElementById('modal-body');
    copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
    localStorage.setItem('lang', currentLang || 'bg');
    localStorage.setItem('oneTapLink', 'true');
    useArhDb = false;
    useLocalFolder = false;
    useGoogleDb = true;
    useIndexedDb = false;
    dirHandle = null;
    isOffline = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    // Мрежата и дискът се заместват: важното е КАКВО се трие, не как.
    window.__deleted = [];   // какво е поискано да се изтрие от Drive
    window.__dbDeleted = []; // какво е махнато от IndexedDB
    window.__wrote = [];     // записани бележки
    window.__opened = [];    // отворени файлове
    window.open = (u) => { window.__opened.push(String(u)); return null; };
    deleteGDriveFile = async (id) => { window.__deleted.push(String(id)); return true; };
    deleteFromDB = async (store, key) => { window.__dbDeleted.push(String(key)); return true; };
    deleteLocalFile = async () => true;
    writeNoteToSources = async (note) => { window.__wrote.push(note && note.id); return true; };
    refreshNoteUI = async () => {};
    // Потвърждението: отговаря с това, което проверката зададе предварително.
    window.__realShowConfirmation = showConfirmation;
    window.__confirmAnswer = true;
    window.__confirmMessages = [];
    showConfirmation = async (message) => { window.__confirmMessages.push(String(message)); return window.__confirmAnswer; };
});

let openCount = 0;
const openReadModal = (raw) => page.evaluate(async ({ raw, n }) => {
    showModal({ raw, format: null, id: 'N1', gdid: 'G1' });
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        const tiles = [...document.querySelectorAll('#modal-body .nm-attach-tile')];
        if (tiles.length === 4) return tiles.length;
        await new Promise(r => setTimeout(r, 30));
    }
    return 0;
}, { raw, n: ++openCount });

const NOTE_RAW = 'Заглавие на бележката|Тук има снимка * и още текст край';
const ATT = [
    { gdid: '1MedWallet00000000000000000000aa', id: 101, noteid: 'G1', path: 'Wallet.jpg', pathGD: '1WalletFile00000000000000000bb', type: 1 },
    { gdid: '1MedPdf0000000000000000000000cc', id: 102, noteid: 'G1', path: 'Винетка.pdf', pathGD: '1PdfFile0000000000000000000dd', type: 3 },
    { gdid: '1MedSpot0000000000000000000000ee', id: 103, noteid: 'G1', path: '42.7|23.3|Етикет', type: 5 },
    { gdid: '1MedBroken0000000000000000000ff', id: 104, noteid: 'G1', path: '', type: 3 }
];

const noteObj = () => {
    const body = 'Тук има снимка * и още текст край'; // 30 знака (UTF-16) - сметката е в браузъра
    const star = body.indexOf('*');
    const title = 'Заглавие на бележката';
    return {
        id: 'N1', gdid: 'G1', boardid: 'B1', notetxt: title + '|' + body,
        text_span: JSON.stringify({ start: star, end: star + 1, type: 8, paramint: 3, paramstring: 'Wallet.jpg' })
            + '|' + JSON.stringify({ start: 0, end: 3, type: 1 }) + '|',
        title_span: '', datemod: 1, version: 1,
        uiState: {}, date: 1, numord: 1, color: 0
    };
};
const seed = () => page.evaluate(({ att, note }) => {
    mediaData.length = 0;
    mediaData.push(...att.map(a => ({ ...a })));
    allNotesData.length = 0;
    allNotesData.push({ ...note });
    window.__deleted.length = 0;
    window.__dbDeleted.length = 0;
    window.__wrote.length = 0;
    window.__opened.length = 0;
    window.__confirmMessages.length = 0;
}, { att: ATT, note: noteObj() });

// --- 1. X има на всяка плочка на файл, а на type=5 няма --------------------------------------
await seed();
await openReadModal(NOTE_RAW);
const badgeInfo = await page.evaluate(() => [...document.querySelectorAll('#modal-body .nm-attach-tile')].map(t => {
    const b = t.querySelector(':scope > .nm-attach-del');
    const cs = b ? getComputedStyle(b) : null;
    const r = b ? b.getBoundingClientRect() : null;
    const tr = t.getBoundingClientRect();
    return {
        type: t.dataset.type,
        name: t.dataset.nmFileName,
        hasBadge: !!b,
        tag: b ? b.tagName : null,
        role: b ? b.getAttribute('role') : null,
        tabindex: b ? b.getAttribute('tabindex') : null,
        nestedButton: b ? !!b.querySelector('button') || b.tagName === 'BUTTON' : false,
        title: b ? b.getAttribute('title') : null,
        w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
        display: cs ? cs.display : null,
        opacity: cs ? cs.opacity : null,
        visibility: cs ? cs.visibility : null,
        topRight: r && tr ? Math.round(tr.right - r.right) : null, // 0 = долепено за десния ръб
        beforeBg: b ? getComputedStyle(b, '::before').backgroundColor : null,
        z: cs ? cs.zIndex : null
    };
}));
const files = badgeInfo.filter(b => ['1', '2', '3', '4'].includes(b.type));
const place = badgeInfo.find(b => b.type === '5');
ok(files.length === 3 && files.every(b => b.hasBadge), '(1) X има на всяка плочка на файл', badgeInfo);
ok(place && !place.hasBadge, '(1) type=5 (място) няма X', place);
const wallet = files.find(b => b.name === 'Wallet.jpg');
ok(!!wallet && wallet.tag === 'SPAN' && wallet.role === 'button' && wallet.tabindex === '0' && !wallet.nestedButton,
    '(2) X е span role=button tabindex=0, не вложен <button>', wallet);
ok(!!wallet && wallet.display === 'block' && wallet.opacity === '1' && wallet.visibility === 'visible',
    '(2) X се вижда ВИНАГИ (не само при задържане)', wallet);
ok(!!wallet && wallet.w >= 18 && wallet.h >= 18, '(2) X е достатъчно голям за пръст (~20px)', wallet);
ok(!!wallet && wallet.topRight === 0 && Number(wallet.z) >= 1, '(2) X е в горния десен ъгъл, над снимката', wallet);
ok(!!wallet && /^rgb\(255,\s*255,\s*255\)$/.test(wallet.beforeBg), '(2) кръгчето е бяло (четимо върху снимка)', wallet && wallet.beforeBg);
ok(!!wallet && /Wallet\.jpg/.test(wallet.title || ''), '(2) подсказката на X казва кой файл се трие', wallet && wallet.title);

// --- 2. Отказ: натискането пита, но не пипа нищо ---------------------------------------------
await page.evaluate(() => {
    window.__confirmAnswer = false;
    window.__confirmMessages.length = 0;
    const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile')]
        .find(t => t.dataset.nmFileName === 'Wallet.jpg');
    tile.querySelector('.nm-attach-del').click();
});
await page.waitForFunction(() => window.__confirmMessages.length > 0, null, { timeout: 4000 }).catch(() => {});
const afterCancel = await page.evaluate(() => ({
    opened: window.__opened.slice(),
    messages: window.__confirmMessages.slice(),
    modeTextarea: !!document.querySelector('#modal-body textarea'),
    tiles: document.querySelectorAll('#modal-body .nm-attach-tile').length,
    records: mediaData.length,
    deleted: window.__deleted.slice(),
    text: (allNotesData.find(x => x.id === 'N1') || {}).notetxt
}));
ok(afterCancel.opened.length === 0, '(3) натискането на X не отваря файла', afterCancel.opened);
ok(afterCancel.messages.length === 1 && /Wallet\.jpg/.test(afterCancel.messages[0]),
    '(3) потвърждението казва името на файла', afterCancel.messages);
ok(/Google Drive/.test(afterCancel.messages[0] || ''), '(3) потвърждението казва, че файлът пада и от Drive', afterCancel.messages);
ok(afterCancel.modeTextarea === false, '(3) натискането на X не влиза в редакция');

ok(afterCancel.tiles === 4 && afterCancel.records === 4 && afterCancel.deleted.length === 0,
    '(4) „Отказ" не пипа нито плочката, нито записа, нито Drive', afterCancel);
ok(afterCancel.text === NOTE_RAW, '(4) „Отказ" не пипа текста на бележката', afterCancel.text);

// --- 3. Потвърждение: трие плочката, записа в media.txt, файла в Drive и снимката в текста ---
await page.evaluate(() => {
    window.__confirmAnswer = true;
    window.__confirmMessages.length = 0;
    const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile')]
        .find(t => t.dataset.nmFileName === 'Wallet.jpg');
    tile.querySelector('.nm-attach-del').click();
});
await page.waitForFunction(() => {
    const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile')]
        .find(t => t.dataset.nmFileName === 'Wallet.jpg');
    return !tile && !mediaData.some(m => m.path === 'Wallet.jpg');
}, null, { timeout: 8000 }).catch(() => {});
const afterDelete = await page.evaluate(() => {
    const note = allNotesData.find(x => x.id === 'N1') || {};
    const body = String(note.notetxt || '').split('|')[1] || '';
    return {
        tiles: [...document.querySelectorAll('#modal-body .nm-attach-tile')].map(t => t.dataset.nmFileName),
        records: mediaData.map(m => m.path),
        deleted: window.__deleted.slice(),
        text: note.notetxt,
        body,
        hasStar: body.includes('*'),
        spans: String(note.text_span || '').split('|').filter(Boolean).map(s => JSON.parse(s)),
        wrote: window.__wrote.slice(),
        opened: window.__opened.slice()
    };
});
ok(afterDelete.tiles.length === 3 && !afterDelete.tiles.includes('Wallet.jpg'),
    '(5) плочката на изтрития файл я няма, другите две остават', afterDelete.tiles);
ok(!afterDelete.records.includes('Wallet.jpg') && afterDelete.records.length === 3,
    '(5) записът в media.txt е махнат, другите записи остават', afterDelete.records);
ok(afterDelete.deleted.includes('1MedWallet00000000000000000000aa'), '(5) записът media.txt е изтрит и от Drive', afterDelete.deleted);
ok(afterDelete.deleted.includes('1WalletFile00000000000000000bb'), '(5) самият файл е изтрит от Drive', afterDelete.deleted);
ok(!afterDelete.deleted.includes('1PdfFile0000000000000000000dd') && !afterDelete.deleted.includes('1MedPdf0000000000000000000000cc'),
    '(6) файлът на другата плочка не се пипа', afterDelete.deleted);
ok(!afterDelete.hasStar && afterDelete.body === 'Тук има снимка  и още текст край',
    '(7) вградената снимка е махната от текста, текстът остава', afterDelete.body);
const boldAfter = afterDelete.spans.find(f => f.type === 1);
ok(!!boldAfter && afterDelete.body.slice(boldAfter.start, boldAfter.end) === 'Тук',
    '(7) останалите формати сочат същите думи', { boldAfter, slice: boldAfter && afterDelete.body.slice(boldAfter.start, boldAfter.end) });
ok(!afterDelete.spans.some(f => f.type === 8), '(7) диапазонът на махнатата снимка го няма', afterDelete.spans);
ok(afterDelete.wrote.length >= 1, '(7) бележката е записана в източниците', afterDelete.wrote);
ok(afterDelete.opened.length === 0, '(5) файлът не е отворен при триенето', afterDelete.opened);
const toastText = await page.evaluate(() => (document.getElementById('toastNotification') || {}).textContent || '');
ok(/Wallet\.jpg/.test(toastText), '(8) излиза съобщение с името на изтрития файл', toastText);

// --- 4. Клавиатура: Enter върху X (фокус) също трие и не отваря файла ------------------------
await seed();
await openReadModal(NOTE_RAW + ' (2)');
await page.evaluate(() => {
    window.__confirmAnswer = true;
    window.__confirmMessages.length = 0;
    const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile')]
        .find(t => t.dataset.nmFileName === 'Wallet.jpg');
    const badge = tile.querySelector('.nm-attach-del');
    badge.focus();
    badge.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
});
await page.waitForFunction(() => !mediaData.some(m => m.path === 'Wallet.jpg'), null, { timeout: 8000 }).catch(() => {});
const afterKey = await page.evaluate(() => ({
    records: mediaData.map(m => m.path),
    opened: window.__opened.slice(),
    deleted: window.__deleted.slice(),
    focused: document.activeElement ? document.activeElement.className : ''
}));
ok(!afterKey.records.includes('Wallet.jpg'), '(9) Enter върху X трие файла', afterKey.records);
ok(afterKey.opened.length === 0, '(9) Enter върху X не отваря файла', afterKey.opened);
ok(afterKey.deleted.includes('1WalletFile00000000000000000bb'), '(9) Enter върху X трие и файла в Drive', afterKey.deleted);

// --- 5. Редакция: снимката изчезва от полето, а форматите се изместват ------------------------
await seed();
const editResult = await page.evaluate(async () => {
    // Чернова в редакция: полето, dataset.format и dataset.titleFormat.
    const host = document.getElementById('modal-body');
    showModal({ raw: 'Тук има снимка * и още текст край', format: null, id: 'N1', gdid: 'G1' });
    const body = 'Тук има снимка * и още текст край';
    const star = body.indexOf('*');
    const wrap = document.createElement('div');
    const ta = document.createElement('textarea');
    ta.id = 'note-edit-textarea';
    ta.value = body;
    wrap.appendChild(ta);
    host.appendChild(wrap);
    host.dataset.nmEditMode = '1';
    host.dataset.format = JSON.stringify({ start: star, end: star + 1, type: 8, paramint: 3, paramstring: 'Wallet.jpg' })
        + '|' + JSON.stringify({ start: 0, end: 3, type: 1 }) + '|';
    const removed = nmCutInlineImageInEditField(ta, ['format'], 'Wallet.jpg', host);
    const spans = host.dataset.format.split('|').filter(Boolean).map(s => JSON.parse(s));
    return {
        removed,
        text: ta.value,
        spans,
        boldSlice: spans.filter(f => f.type === 1).map(f => ta.value.slice(f.start, f.end)),
        undo: typeof getNoteEditUndoHistory === 'function' ? 'ok' : 'n/a'
    };
});
ok(editResult.removed === 1 && editResult.text === 'Тук има снимка  и още текст край',
    '(10) в редакция знакът на снимката изчезва от полето', editResult);
ok(editResult.boldSlice.length === 1 && editResult.boldSlice[0] === 'Тук',
    '(10) удебеленото в редакция пак покрива същата дума', editResult.boldSlice);
ok(!editResult.spans.some(f => f.type === 8), '(10) диапазонът на снимката пада от format', editResult.spans);

// --- 6. Плочка на чакащ файл: X я маха без запис в media.txt ---------------------------------
await seed();
const pendingResult = await page.evaluate(async () => {
    const host = document.getElementById('modal-body');
    const pending = { path: 'New.png', pathGD: '', type: 1, description: '', _pending: true, _blobUrl: URL.createObjectURL(new Blob([new Uint8Array([1])], { type: 'image/png' })) };
    addPendingAttachment('N1', pending);
    let revoked = null;
    const usedUrl = pending._blobUrl;
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (u) => { revoked = String(u); };
    // Плочката се строи в async IIFE (чака Drive) - чака се да излезе, не се взима веднага.
    rebuildEditAttachmentStrip();
    const waitFor = async (name) => {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
            const t = [...document.querySelectorAll('#modal-body .nm-attach-tile')].find(x => x.dataset.nmFileName === name);
            if (t) return t;
            await new Promise(r => setTimeout(r, 30));
        }
        return null;
    };
    const tile = await waitFor('New.png');
    const hadBadge = !!(tile && tile.querySelector('.nm-attach-del'));
    const done = await nmDeleteNoteAttachment(tile, pending);
    URL.revokeObjectURL = origRevoke;
    return {
        hadBadge, done, revoked, usedUrl,
        left: pendingAttachmentsOf('N1').map(e => e.path),
        tiles: [...document.querySelectorAll('#modal-body .nm-attach-tile')].map(t => t.dataset.nmFileName)
    };
});
ok(pendingResult.hadBadge, '(11) чакащата плочка също има X', pendingResult);
ok(pendingResult.done === true && pendingResult.left.length === 0, '(11) чакащият запис се маха', pendingResult);
ok(/^blob:/.test(pendingResult.revoked || '') && pendingResult.usedUrl === pendingResult.revoked,
    '(11) blob адресът на чакащата плочка се отменя', pendingResult);
ok(!pendingResult.tiles.includes('New.png'), '(11) плочката на чакащия файл изчезва', pendingResult.tiles);

// --- 7. Последната плочка: лентата изчезва цялата ---------------------------------------------
await seed();
const lastOne = await page.evaluate(async () => {
    mediaData.length = 0;
    mediaData.push({ gdid: '1MedPdf0000000000000000000000cc', id: 102, noteid: 'G1', path: 'Винетка.pdf', pathGD: '1PdfFile0000000000000000000dd', type: 3 });
    rebuildEditAttachmentStrip();
    const waitFor = async (name) => {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
            const t = [...document.querySelectorAll('#modal-body .nm-attach-tile')].find(x => x.dataset.nmFileName === name);
            if (t) return t;
            await new Promise(r => setTimeout(r, 30));
        }
        return null;
    };
    const tile = await waitFor('Винетка.pdf');
    await nmDeleteNoteAttachment(tile, { path: 'Винетка.pdf', pathGD: '1PdfFile0000000000000000000dd', type: 3 });
    return {
        strip: !!document.querySelector('#modal-body > .nm-attach-strip'),
        sep: !!document.querySelector('#modal-body > .nm-attach-sep'),
        tiles: document.querySelectorAll('#modal-body .nm-attach-tile').length
    };
});
ok(lastOne.tiles === 0 && !lastOne.strip && !lastOne.sep,
    '(12) след последната плочка лентата и чертата изчезват', lastOne);

// --- 8. Истинското потвърждение (не заместеното): вижда се над модала и отговаря вярно --------
// Вика се директно запазеното истинско, а заместеното остава - иначе следващите проверки биха
// чакали човешки клик.
await page.evaluate(() => { if (!window.__realShowConfirmation) throw new Error('няма запазено потвърждение'); });
const realConfirm = await page.evaluate(async () => {
    const answer = window.__realShowConfirmation('Тестово потвърждение: Wallet.jpg');
    // Прозорецът се появява с преход (opacity 0.3s) - изчаква се кадърът, в който е видим.
    const popup = document.getElementById('folderIdPromptPopup');
    for (let i = 0; i < 120; i++) {
        if (getComputedStyle(popup).visibility === 'visible' && parseFloat(getComputedStyle(popup).opacity) > 0.9) break;
        await new Promise(r => setTimeout(r, 16));
    }
    const yes = document.getElementById('submitFolderIdBtn');
    const no = document.getElementById('prompt-no-btn');
    const shown = !!popup && popup.classList.contains('show');
    const message = popup ? popup.querySelector('p').textContent : '';
    const style = popup ? getComputedStyle(popup) : null;
    const yesText = yes ? yes.textContent.trim() : '';
    const noText = no ? no.textContent.trim() : '';
    // getComputedStyle е ЖИВ обект - стойностите се снемат сега, преди прозорецът да се затвори.
    const r = popup ? popup.getBoundingClientRect() : null;
    const visible = !!(style && style.display !== 'none' && style.visibility === 'visible' && r && r.width > 0 && r.height > 0);
    // „Не" първо: отказ.
    if (no) no.click();
    const noAnswer = await answer;
    const closedAfterNo = !popup.classList.contains('show');
    // Втори опит: „Да".
    const second = window.__realShowConfirmation('Тестово потвърждение: Wallet.jpg');
    document.getElementById('prompt-no-btn').click();
    const third = window.__realShowConfirmation('Тестово потвърждение: Wallet.jpg');
    document.getElementById('submitFolderIdBtn').click();
    const [noAgain, yesAnswer] = await Promise.all([second, third]);
    return { shown, message, yesText, noText, noAnswer, noAgain, yesAnswer, closedAfterNo, visible };
});
ok(realConfirm.shown && realConfirm.visible, '(14) потвърждението се показва (над модала)', realConfirm);
ok(/Wallet\.jpg/.test(realConfirm.message), '(14) в потвърждението стои името на файла', realConfirm.message);
ok(!!realConfirm.yesText && !!realConfirm.noText, '(14) бутоните са „Да"/„Не" с превод', realConfirm);
ok(realConfirm.noAnswer === false && realConfirm.noAgain === false && realConfirm.closedAfterNo,
    '(14) „Не" връща false и затваря прозореца', realConfirm);
ok(realConfirm.yesAnswer === true, '(14) „Да" връща true', realConfirm);

// --- 9. Счупен запис (без път): плочката има X и записът се маха ------------------------------
// (потвърждението се връща на заместеното: истинското чака човешки клик)
await page.evaluate(() => { window.__confirmAnswer = true; });
await seed();
const brokenResult = await page.evaluate(async () => {
    showModal({ raw: 'Бележка|текст', format: null, id: 'N1', gdid: 'G1' });
    const waitFor = async (pred) => {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) { if (pred()) return true; await new Promise(r => setTimeout(r, 30)); }
        return false;
    };
    await waitFor(() => document.querySelectorAll('#modal-body .nm-attach-tile').length === 4);
    const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile')].find(t => t.dataset.state === 'missing');
    const badge = tile ? tile.querySelector('.nm-attach-del') : null;
    const label = badge ? badge.getAttribute('aria-label') : '';
    await nmDeleteNoteAttachment(tile, { gdid: '1MedBroken0000000000000000000ff', id: 104, noteid: 'G1', path: '', type: 3 });
    await waitFor(() => !mediaData.some(m => m.id === 104));
    return {
        hadBadge: !!badge, label,
        records: mediaData.map(m => m.id),
        tiles: [...document.querySelectorAll('#modal-body .nm-attach-tile')].map(t => t.dataset.state)
    };
});
ok(brokenResult.hadBadge, '(15) плочката на запис без път също има X', brokenResult);
ok(!/„\s*“/.test(brokenResult.label || '') && /Other/.test(brokenResult.label || ''),
    '(15) подсказката не е празна - казва папката на типа', brokenResult.label);
ok(!brokenResult.records.includes(104), '(15) счупеният запис се маха от mediaData', brokenResult.records);
ok(brokenResult.tiles.filter(s => s === 'missing').length === 0, '(15) плочката с пунктир изчезва', brokenResult.tiles);

ok(errs.length === 0, '(13) в конзолата няма грешки', errs);

console.log(`\n${n - fails}/${n} проверки минаха${fails ? `, ${fails} ПАДНАХА` : ''}`);
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
