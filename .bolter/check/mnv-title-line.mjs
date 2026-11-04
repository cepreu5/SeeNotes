// Първият (удебелен) ред на бележката в борда на MNV се образува като в uni.
//
// Повод (3 Nov 2026, собственикът): „става дума за първия ред от текста на бележката в борда, който
// се показва bold - в mnv да се образува както в uni". Досега MNV решаваше другояче какво стои на
// реда и какво в тялото:
//   - разделителят '|' се смяташе само при type === 1, значи при обикновена бележка целият текст
//     (с „|" вътре) отиваше в заглавието;
//   - заглавието се режеше с substring(0, 50), а после CSS слагаше многоточие по средата на дума;
//   - редът-заглавие оставаше в тялото, значи заглавието се повтаряше над текста.
// Сега е като в uni: с '|' заглавие е частта преди него, без '|' - първият непразен ред, който се
// МАХА от тялото; когато редът не се побира по ширина, той се срязва на ГРАНИЦА НА ДУМА, а остатъкът
// от СЪЩИЯ ред отива в началото на тялото; markdown-знаците (#) не се чистят.
//
// Очакваните стойности по-долу НЕ са измислени: измерени са от uni с истински Chromium (1280x900,
// карта 250px, редът 228px, шрифт 18.72px/700) със същите засеяни бележки - затова тестът пада на
// кода отпреди b1.86 (вж. ROOT= в края на файла).
//
// Какво проверява (истински Chromium, истинският MNV код, засята IndexedDB NotesDB):
//   1) бележка с '|' (type 0): заглавие - точно частта преди '|', тялото - след нея, без повторение;
//   2) '|' и '#' в началото: заглавието пази '#' (както в uni);
//   3) без '|', два реда: заглавието е началото на първия ред, тялото НЕ започва с него, вторият ред
//      е в тялото;
//   4) дълъг първи ред: заглавието не се реже от CSS (scrollWidth <= clientWidth), свършва на граница
//      на дума, остатъкът от реда е в началото на тялото и нито една дума не липсва между двете;
//   5) type 1 с '|': заглавие преди '|', тяло след него (както досега);
//   6) първи ред само с линк: заглавието е линкът, тялото започва със следващия ред;
//   7) празна бележка: заглавие „...", тяло празно - както досега;
//   8) скрита бележка (pass: true): заглавието и тялото са както досега;
//   9) формати (text_span): след изрязването на заглавието цветът стои на СЪЩАТА дума;
//  10) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-title-line.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (така се пуска контролата върху стария код, напр.
// ROOT=/tmp/b185/MNV - там проверките за образуването на реда трябва да паднат).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs',
    'playwright'
].find(p => p === 'playwright' || existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = [
    '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome'
].find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'MNV');
const PAGE = process.env.MNV_PAGE || 'index-2.html';
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}
const DB_NAME = process.env.MNV_DB || 'NotesDB';
const SEED_PATH = '/__seed.html';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 900);

// --- Бележките: какво слагаме и какво трябва да покаже картата (измерено от uni) ------------------
// colorWord: думата, която трябва да остане оцветена (text_span type=4) - по нея се вижда дали
// форматите са се разместили заедно с изрязаното заглавие.
const FIXTURES = [
    {
        gdid: 'T1', type: 0,
        txt: 'Заглавие на бележката|Тялото на бележката, което е доста дълго и не бива да влиза в заглавието',
        title: 'Заглавие на бележката',
        body: 'Тялото на бележката, което е доста дълго и не бива да влиза в заглавието',
        why: 'с „|": заглавие е частта преди него, тялото - след него'
    },
    {
        gdid: 'T2', type: 0,
        txt: '# Markdown заглавие|тялото след решетката',
        title: '# Markdown заглавие',
        body: 'тялото след решетката',
        why: 'markdown-знакът „#" не се чисти от показания ред (както в uni)'
    },
    {
        gdid: 'T3', type: 0,
        txt: 'Бележка без разделител, първи ред\nвтори ред на бележката',
        title: 'Бележка без',
        body: 'разделител, първи редвтори ред на бележката',
        why: 'без „|": заглавие е началото на първия ред, остатъкът му оглавява тялото'
    },
    {
        gdid: 'T4', type: 0,
        txt: 'Много дълъг първи ред без разделител, който минава петдесет знака и още доста\nвтори ред',
        title: 'Много дълъг първи',
        body: 'ред без разделител, който минава петдесет знака и още доставтори ред',
        longFirstLine: true,
        why: 'дълъг първи ред: заглавието се срязва на граница на дума, остатъкът влиза в тялото'
    },
    {
        gdid: 'T5', type: 1,
        txt: 'Заглавие при тип 1|тяло при тип 1',
        title: 'Заглавие при тип 1',
        body: 'тяло при тип 1',
        why: 'type 1 с „|": както досега'
    },
    {
        gdid: 'T6', type: 0,
        txt: 'https://example.com/линк\nистинското заглавие на бележката',
        title: 'https://example.com/линк',
        body: 'истинското заглавие на бележката',
        why: 'първи ред само с линк: заглавието е линкът, тялото започва със следващия ред'
    },
    {
        gdid: 'T7', type: 0, txt: '',
        title: '...', body: '',
        why: 'празна бележка: „..." и празно тяло, както досега'
    },
    {
        gdid: 'T8', type: 0, pass: true, hidden: true,
        txt: 'Тайно заглавие|тайно тяло',
        title: 'Тайно заглавие',
        body: 'Тайно заглавие',
        why: 'скрита бележка: заглавието и тялото са както досега (тялото е частта преди „|")'
    },
    {
        gdid: 'F1', type: 0,
        txt: 'Заглавие на бележката|Тялото със цветна дума накрая',
        colorWord: 'цветна',
        title: 'Заглавие на бележката',
        body: 'Тялото със цветна дума накрая',
        why: 'формати при „|": цветът остава на същата дума'
    },
    {
        gdid: 'F2', type: 0,
        txt: 'Много дълъг първи ред без разделител, който минава петдесет знака и още доста\nвтори ред със цветна дума',
        colorWord: 'цветна',
        title: 'Много дълъг първи',
        body: 'ред без разделител, който минава петдесет знака и още доставтори ред със цветна дума',
        why: 'формати без „|": цветът остава на същата дума и след срязването на заглавието'
    }
];

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};
// Сравнява текст по думи: така не зависи от това как точно са слети редовете (<br> не дава знак за
// нов ред в textContent) и от повтарящите се интервали.
const words = (s) => String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === SEED_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body>seed</body></html>');
        return;
    }
    const rel = p === '/' ? PAGE : p.replace(/^\//, '');
    try {
        const b = await readFile(path.join(root, rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://localhost:${srv.address().port}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const errs = [];

// Разчита какво стои на първия ред на картата и какво в тялото ѝ.
const readCards = async (page) => page.evaluate((gdids) => {
    const out = {};
    gdids.forEach(gdid => {
        const card = document.querySelector(`#notes-container .note[data-g="${gdid}"]`);
        if (!card) { out[gdid] = { card: false }; return; }
        const titleEl = card.querySelector('.note-title-truncated');
        const contentEl = card.querySelector('.note-content');
        const cs = titleEl ? getComputedStyle(titleEl) : null;
        const colorSpans = contentEl
            ? [...contentEl.querySelectorAll('span[style*="color"]')].map(s => ({ text: s.textContent, style: s.getAttribute('style') || '' }))
            : [];
        out[gdid] = {
            card: true,
            title: titleEl ? titleEl.textContent : null,
            titleClientWidth: titleEl ? titleEl.clientWidth : 0,
            titleScrollWidth: titleEl ? titleEl.scrollWidth : 0,
            titleBoxWidth: titleEl ? Math.round(titleEl.getBoundingClientRect().width * 100) / 100 : 0,
            titleFont: cs ? `${cs.fontSize}/${cs.fontWeight}` : null,
            body: contentEl ? contentEl.textContent : null,
            colorSpans
        };
    });
    return out;
}, FIXTURES.map(f => f.gdid));

const openApp = async (ctx) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
    await page.addInitScript(() => {
        const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
        window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
        window.gapi = { client: { setToken() { }, getToken() { return { access_token: 'test-token' }; }, drive: { files: { list: async () => ({ result: { files: [] } }) } } }, load() { } };
        const realFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.includes('googleapis.com')) return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
            return realFetch(input, init);
        };
        window.kofiWidgetOverlay = { draw() { } };
        window.kofiwidget2 = { init() { }, draw() { } };
        localStorage.setItem('useIndexedDb', 'true');
        localStorage.setItem('useGoogleDb', 'false');
        localStorage.setItem('useLocalDb', 'false');
        localStorage.setItem('useLocalFolder', 'false');
        localStorage.setItem('useArhDb', 'false');
        localStorage.setItem('updateFromSource', 'false');
        localStorage.setItem('lang', 'bg');
        localStorage.setItem('language', 'bg');
        localStorage.setItem('hideAssistant', 'true');
        localStorage.setItem('guide', 'false');
        localStorage.setItem('showBoardAll', 'false');
        localStorage.setItem('startBoard', 'b1');
        // Фонът на бележката е изключен: тогава редът-заглавие е широк колкото е в измерването на uni
        // (карта 250px, ред 228px - без отстъпите, които .note:not(.note-item) маха).
        localStorage.setItem('notesBgrd', 'false');
    });

    // --- Засяване на базата преди старта -----------------------------------------------------
    await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
    const seed = await page.evaluate(async ({ dbName, fixtures }) => {
        const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null };
        const out = {};
        try {
            await new Promise((res) => { const d = indexedDB.deleteDatabase(dbName); d.onsuccess = d.onerror = d.onblocked = () => res(); setTimeout(res, 3000); });
            const db = await new Promise((res, rej) => {
                const req = indexedDB.open(dbName, 4);
                req.onupgradeneeded = () => {
                    const d = req.result;
                    for (const [name, opt] of Object.entries(STORES)) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opt || undefined);
                };
                req.onsuccess = () => res(req.result);
                req.onerror = () => rej(req.error);
            });
            const now = Date.now();
            const notes = fixtures.map((f, i) => {
                // Оцветяването (type=4) е върху colorWord - както го пази приложението: офсети в целия текст.
                let textSpan = '';
                if (f.colorWord) {
                    const start = f.txt.indexOf(f.colorWord);
                    textSpan = JSON.stringify({ type: 4, start, end: start + f.colorWord.length, paramint: 0xFFFF0000 }) + '|';
                }
                return {
                    alarm_type: -1, boardid: 'b1', calendarDate: 0, color: 0,
                    date: now, datemod: now, eventId: 0, gdid: f.gdid, id: 1001 + i,
                    notetxt: f.txt, numord: i + 1, pass: !!f.pass, sellist: 0, status: 0,
                    type: f.type || 0, text_span: textSpan, timer: 0, timer_type: -1, timer_val: 1,
                    title_span: '', version: 243
                };
            });
            await new Promise((res, rej) => {
                const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
                tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                tx.objectStore('boards').clear(); tx.objectStore('notes').clear();
                tx.objectStore('media').clear(); tx.objectStore('config').clear();
                tx.objectStore('boards').put({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Работа' });
                notes.forEach(nt => tx.objectStore('notes').put(nt));
                tx.objectStore('config').put(1, 'dbSource');
                tx.objectStore('config').put('gdid', 'dbNoteIdType');
                tx.objectStore('config').put(now, 'dbCreatedTimestamp');
                tx.objectStore('config').put(now, 'lastLocalTimestamp');
            });
            db.close();
            out.ok = notes.length;
        } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
        return out;
    }, { dbName: DB_NAME, fixtures: FIXTURES });

    ok(!seed.err && seed.ok === FIXTURES.length, `базата е засята: борд и ${FIXTURES.length} бележки`, seed.err || seed.ok);

    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    const booted = await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof startApp === 'function', null, { timeout: 30000 })
        .then(() => true, () => false);
    ok(booted, 'страницата на приложението се зареди');
    if (!booted) return { page, seed };

    const boot = await page.evaluate(async () => {
        const info = { err: '' };
        isOfflineMode = true;
        try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { }
        try { await startApp(); } catch (e) { info.err = String((e && e.message) || e).slice(0, 300); }
        ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
        info.cards = document.querySelectorAll('#notes-container .note').length;
        return info;
    });
    ok(!boot.err && boot.cards === FIXTURES.length, 'приложението стартира и нарисува картите', boot);

    // Заглавието се срязва по ширина, когато картата вече е в страницата - изчакваме реда да има
    // ширина и два кадъра, за да е минало и срязването (то става в ResizeObserver, преди рисуването).
    const laidOut = await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('#notes-container .note')];
        if (!cards.length) return false;
        return cards.every(card => {
            const t = card.querySelector('.note-title-truncated');
            return !!t && t.clientWidth > 0;
        });
    }, null, { timeout: 15000 }).then(() => true, () => false);
    ok(laidOut, 'картите са в страницата и редът-заглавие има ширина', await page.evaluate(() =>
        [...document.querySelectorAll('#notes-container .note')].map(c => {
            const t = c.querySelector('.note-title-truncated');
            return { g: c.dataset.g, w: t ? t.clientWidth : null };
        })));
    if (laidOut) await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    return { page, seed };
};

// --- Част 1: какво показва първият ред и тялото при всяка бележка --------------------------------
const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block', locale: 'en-GB' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const { page } = await openApp(ctx);
const cards = await readCards(page);

for (const f of FIXTURES) {
    const got = cards[f.gdid] || {};
    ok(got.card === true, `${f.gdid}: картата е на борда (${f.why})`, got);
    if (!got.card) continue;
    if (f.title !== undefined) {
        ok(got.title === f.title, `${f.gdid}: заглавието е „${f.title}"`, { got: got.title, font: got.titleFont });
    }
    if (f.body !== undefined) {
        ok(String(got.body || '').trim() === f.body, `${f.gdid}: тялото е „${f.body}"`, got.body);
        // При скритата бележка тялото Е частта преди „|" - там повторението е днешното поведение.
        if (!f.hidden && f.title && f.title !== '...' && f.body) {
            ok(!String(got.body).trim().startsWith(f.title),
                `${f.gdid}: тялото не започва със заглавието (не се повтаря)`, got.body);
        }
    }
    // Оцветената дума (text_span type=4): цветът стои на СЪЩАТА дума, не на съседна.
    if (f.colorWord) {
        const colored = (got.colorSpans || []).filter(s => /rgba?\(255,\s*0,\s*0/.test(s.style));
        ok(colored.length === 1, `${f.gdid}: има точно едно оцветено място в тялото`, got.colorSpans);
        ok(colored.some(s => s.text.trim() === f.colorWord),
            `${f.gdid}: оцветена е думата „${f.colorWord}", а не съседна`, got.colorSpans);
    }
}

// --- Част 2: дългият първи ред - ширина и граница на дума ---------------------------------------
const long = FIXTURES.find(f => f.longFirstLine);
const longCard = cards[long.gdid] || {};
if (longCard.card) {
    ok(longCard.titleScrollWidth <= longCard.titleClientWidth && longCard.titleBoxWidth <= longCard.titleClientWidth + 0.5,
        `${long.gdid}: заглавието не се реже от CSS (scrollWidth ${longCard.titleScrollWidth} <= clientWidth ${longCard.titleClientWidth})`,
        longCard);
    const firstLine = long.txt.split('\n')[0];
    ok(firstLine.startsWith(longCard.title || '\u0000') && /\s/.test(firstLine.charAt((longCard.title || '').length)),
        `${long.gdid}: заглавието свършва на граница на дума`, { title: longCard.title, firstLine });
    // Нито една дума от първия ред не липсва между заглавието и началото на тялото. Сравняваме без
    // интервали: на сглобката заглавие|тяло интервалът е изяден (както е и в uni, където двата реда
    // се сливат в „още доста" + „втори ред" = „доставтори ред"), а всеки липсващ или повторен знак
    // се вижда веднага.
    const squeeze = (s) => String(s || '').replace(/\s+/g, '');
    ok(squeeze(`${longCard.title}${longCard.body}`) === squeeze(long.txt),
        `${long.gdid}: заглавие+тяло съдържат целия текст на бележката - нито дума липсва, нито се повтаря`,
        { got: words(`${longCard.title} ${longCard.body}`), want: words(long.txt) });
}

// --- Част 3: пълното заглавие, което се побира, не се срязва -------------------------------------
const short = cards['T1'] || {};
if (short.card) {
    ok(short.titleScrollWidth <= short.titleClientWidth,
        'T1: късото заглавие се побира изцяло (няма многоточие от CSS)', short);
}

ok(errs.length === 0, 'няма изключения в конзолата', errs.slice(0, 3));

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `ALL OK (${n} проверки)`);
process.exit(fails ? 1 : 0);
