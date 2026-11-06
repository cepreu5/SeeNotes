// nomn: когато камбанката звънне, бележката се отваря сама - освен в режим „Единична бележка".
//
// Изискване на собственика (5.11.2026): „Когато звънне, ако не е в single note режим, да отвори
// бележката".
//
// Какво проверява (истински Chromium, истинският код от nomn/):
//   1) нормален режим: звъни бележка - отваря се нейният прозорец, камбанката свети, звукът тръгва;
//   2) две бележки в една минута: отваря се една (първата по ред), а клик върху камбанката отваря
//      втората - значи опашката работи и не се губи нищо;
//   3) режим „Единична бележка": нищо не се отваря, камбанката пак звъни; след изключване на режима
//      клик върху камбанката отваря бележката;
//   4) бележка, която вече е отворена в редакция с написан текст: остава един прозорец и текстът
//      не се пипа (само идва отпред);
//   5) бележка без час, бележка с „Валидност" и момент преди пускането на часовника не отварят нищо;
//   6) камбанката се връща към календарчето след своите 10 секунди;
//   7) няма непохванати грешки в страницата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-bell-opens-note.mjs
// ROOT=… сочи друга папка на приложението (контрола срещу предишната версия на nomn/).
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

const root = path.resolve(process.env.ROOT || 'nomn');
const PAGE = 'index.html';
const W = 390, H = 844;
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? PAGE : p;
    try {
        const b = await readFile(path.join(root, rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://localhost:${srv.address().port}`;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// Всяка проверка е в своя страница: състоянието на камбанката не се пренася между тях.
const openApp = async (predemo = {}) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, timezoneId: 'Europe/Sofia', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
    await page.addInitScript((pre) => {
        // Демото иначе пита за вход; тук приложението стартира направо.
        localStorage.setItem('language', 'bg');
        localStorage.setItem('hideAssistant', 'true');
        if (pre.singleNoteMode === true) localStorage.setItem('singleNoteMode', 'true');
        else localStorage.removeItem('singleNoteMode');
    }, predemo || {});
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'domcontentloaded' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && typeof calendarBell === 'object' && Array.isArray(allNotesData), null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(600);
    return { ctx, page, errs, ready };
};

// Бележка, чийто момент е тази минута: значи е в прозореца от 60 сек на камбанката.
const dueNote = (page, id, extra = {}) => page.evaluate(([id, extra]) => {
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    const note = {
        id,
        gdid: 'g-' + id,
        text: 'бележка ' + id,
        text_span: 'бележка ' + id,
        title_span: '',
        calendarDate: d.getTime(),
        board: 'b1',
        status: 0,
        color: 0,
        uiState: { cTime: p2(d.getHours()) + ':' + p2(d.getMinutes()), cRepeat: '' }
    };
    Object.assign(note, extra);
    return note;
}, [id, extra]);

// Нов списък с бележки и чист часовник, който е тръгнал преди час.
const reset = (page, notes) => page.evaluate((notes) => {
    allNotesData = notes.slice();
    calendarBell.restart(Date.now() - 3600 * 1000);
}, notes);

const tick = (page, now) => page.evaluate((t) => calendarBell.tick(t === null ? Date.now() : t), now === undefined ? null : now);

const state = (page) => page.evaluate(() => {
    const s = calendarBell.state();
    const open = getOpenNoteWindows().map(w => ({ id: String(w.body.dataset.id || ''), hidden: !!w.hidden }));
    const visible = open.filter(w => !w.hidden);
    const top = typeof getTopVisibleNoteWindow === 'function' ? getTopVisibleNoteWindow() : null;
    const btn = document.getElementById('calendar_button');
    return {
        active: s.active,
        queue: s.queue.length,
        soundCalls: s.soundCalls,
        open,
        visible,
        topId: top ? String(top.body.dataset.id || '') : '',
        bellFlashing: !!(btn && btn.classList.contains('cal-bell-flash')),
        bellKey: btn ? btn.getAttribute('data-key-title') : null
    };
});

// --- 1. Нормален режим: звъни бележка - отваря се ---
{
    const { ctx, page, errs, ready } = await openApp();
    ok(ready, '1.1 приложението стартира и камбанката е налична');
    if (ready) {
        const note = await dueNote(page, 'A');
        await reset(page, [note]);
        const due = await tick(page);
        await page.waitForTimeout(600);
        const s = await state(page);
        ok(due === 1, '1.2 един проход на камбанката намери една звъннала бележка', due);
        ok(s.visible.length === 1 && s.visible[0].id === 'A', '1.3 бележката се отвори сама', s.visible);
        ok(s.topId === 'A', '1.4 отворената бележка е отпред', s.topId);
        ok(s.active && s.bellFlashing, '1.5 камбанката свети както преди', s);
        ok(s.soundCalls >= 1, '1.6 звукът е пуснат', s.soundCalls);
        ok(s.queue === 1, '1.7 бележката е и в опашката на камбанката', s.queue);

        // Съдържанието е на бележката, не на друга: текстът се вижда в прозореца.
        const shown = await page.evaluate(() => {
            const w = getTopVisibleNoteWindow();
            return w ? String(w.body.innerText || w.body.textContent || '').slice(0, 120) : '';
        });
        ok(shown.includes('бележка A'), '1.8 в прозореца е текстът на бележка A', shown);
    }
    ok(errs.length === 0, '1.9 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

// --- 2. Две бележки в една минута: отваря се една, клик върху камбанката отваря втората ---
{
    const { ctx, page, errs, ready } = await openApp();
    ok(ready, '2.1 приложението стартира');
    if (ready) {
        const first = await dueNote(page, 'B1');
        const second = await dueNote(page, 'B2');
        await reset(page, [first, second]);
        const due = await tick(page);
        await page.waitForTimeout(600);
        let s = await state(page);
        ok(due === 2, '2.2 звънят две бележки в един проход', due);
        ok(s.visible.length === 1 && s.visible[0].id === 'B1', '2.3 отваря се само първата по ред', s.visible);
        ok(s.queue === 2, '2.4 двете са в опашката на камбанката', s.queue);

        await page.evaluate(() => {
            const btn = document.getElementById('calendar_button');
            if (btn) btn.click();
        });
        await page.waitForTimeout(700);
        s = await state(page);
        const ids = s.visible.map(w => w.id).sort();
        ok(ids.length === 2 && ids[0] === 'B1' && ids[1] === 'B2',
            '2.5 клик върху камбанката отваря втората бележка', ids);
    }
    ok(errs.length === 0, '2.6 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

// --- 3. Режим „Единична бележка": не се отваря нищо, камбанката пак звъни ---
{
    const { ctx, page, errs, ready } = await openApp({ singleNoteMode: true });
    ok(ready, '3.1 приложението стартира в режим „Единична бележка"');
    if (ready) {
        const mode = await page.evaluate(() => isSingleNoteMode());
        ok(mode === true, '3.2 режимът наистина е включен', mode);
        const note = await dueNote(page, 'C');
        await reset(page, [note]);
        const due = await tick(page);
        await page.waitForTimeout(600);
        let s = await state(page);
        ok(due === 1, '3.3 звънналата бележка е намерена', due);
        ok(s.visible.length === 0, '3.4 в режима нищо не се отваря само', s.visible);
        ok(s.active && s.queue === 1 && s.soundCalls >= 1, '3.5 камбанката звъни и пази бележката в опашката', s);

        // След изключване на режима същият клик върху камбанката отваря бележката.
        await page.evaluate(() => localStorage.setItem('singleNoteMode', 'false'));
        await page.evaluate(() => {
            const btn = document.getElementById('calendar_button');
            if (btn) btn.click();
        });
        await page.waitForTimeout(700);
        s = await state(page);
        ok(s.visible.length === 1 && s.visible[0].id === 'C', '3.6 след изключване на режима камбанката отваря бележката', s.visible);
    }
    ok(errs.length === 0, '3.7 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

// --- 4. Бележка, отворена в редакция с написан текст: един прозорец, текстът е непокътнат ---
{
    const { ctx, page, errs, ready } = await openApp();
    ok(ready, '4.1 приложението стартира');
    if (ready) {
        // Отваря се истинска бележка от борда и се влиза в редакция.
        await page.locator('#notes-container .note').first().click();
        await page.waitForTimeout(900);
        await page.evaluate(() => { const b = document.getElementById('note-edit-btn'); if (b) b.click(); });
        await page.waitForTimeout(1200);
        const editing = await page.evaluate(() => {
            const w = getTopVisibleNoteWindow();
            return !!(w && w.box.querySelector('.modal-edit-toolbar'));
        });
        ok(editing, '4.2 бележката е в режим Редактиране');
        const typed = 'написано преди звъненето';
        await page.evaluate((t) => {
            const w = getTopVisibleNoteWindow();
            if (!w) return;
            const areas = [...w.el.querySelectorAll('.nw-modal-body textarea')];
            const ta = areas[areas.length - 1];
            if (!ta) return;
            ta.focus();
            ta.value = t;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }, typed);
        await page.waitForTimeout(400);
        const openId = await page.evaluate(() => String(getTopVisibleNoteWindow()?.body.dataset.id || ''));
        ok(!!openId, '4.3 отворената бележка има id', openId);

        // Същата бележка получава момент тази минута и звъни.
        const madeDue = await page.evaluate((id) => {
            const note = allNotesData.find(n => n && String(n.id) === String(id));
            if (!note) return null;
            const d = new Date();
            const p2 = (v) => String(v).padStart(2, '0');
            note.calendarDate = d.getTime();
            note.uiState = { cTime: p2(d.getHours()) + ':' + p2(d.getMinutes()), cRepeat: '' };
            calendarBell.restart(Date.now() - 3600 * 1000);
            return String(note.id);
        }, openId);
        ok(madeDue === openId, '4.4 същата бележка е насрочена за тази минута', madeDue);
        const due = await tick(page);
        await page.waitForTimeout(600);
        const s = await state(page);
        ok(due === 1, '4.5 камбанката намери отворената бележка', due);
        const count = s.open.filter(w => w.id === openId).length;
        ok(count === 1, '4.6 за същата бележка няма втори прозорец', s.open);
        const stillTyped = await page.evaluate((t) => {
            const w = getTopVisibleNoteWindow();
            if (!w) return null;
            const areas = [...w.el.querySelectorAll('.nw-modal-body textarea')];
            const ta = areas[areas.length - 1];
            return ta ? ta.value.includes(t) : null;
        }, typed);
        ok(stillTyped === true, '4.7 написаното в редакция остава', stillTyped);
        const stillEditing = await page.evaluate(() => {
            const w = getTopVisibleNoteWindow();
            return !!(w && w.box.querySelector('.modal-edit-toolbar'));
        });
        ok(stillEditing, '4.8 бележката си остава в редакция');
    }
    ok(errs.length === 0, '4.9 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

// --- 5. Какво не отваря нищо: без час, „Валидност", момент преди часовника ---
{
    const { ctx, page, errs, ready } = await openApp();
    ok(ready, '5.1 приложението стартира');
    if (ready) {
        const noTime = await dueNote(page, 'D1', { uiState: { cTime: '', cRepeat: '' } });
        await reset(page, [noTime]);
        let due = await tick(page);
        await page.waitForTimeout(400);
        let s = await state(page);
        ok(due === 0 && s.visible.length === 0 && !s.active, '5.2 бележка без час не звъни и не се отваря', { due, s: s.visible });

        const hhmm = await page.evaluate(() => new Date().toTimeString().slice(0, 5));
        const validity = await dueNote(page, 'D2', { uiState: { cTime: hhmm, cRepeat: { f: 'validity', u: null } } });
        // Прозорците от предишните случаи се затварят, за да се вижда само каквото отвори този.
        await page.evaluate(() => { try { window.closeAllNoteWindows(); } catch (e) { } });
        await page.waitForTimeout(700);
        await reset(page, [validity]);
        due = await tick(page);
        await page.waitForTimeout(400);
        s = await state(page);
        ok(due === 0 && s.visible.length === 0, '5.3 бележка с „Валидност" не се отваря', { due, s: s.visible });

        // Момент отпреди часовника на камбанката: отминало е, не звъни, не се отваря.
        const old = await dueNote(page, 'D3');
        await page.evaluate((note) => {
            allNotesData = [note];
            calendarBell.restart(Date.now() + 30 * 1000); // часовникът тръгва след момента от тази минута
        }, old);
        due = await tick(page);
        await page.waitForTimeout(400);
        s = await state(page);
        ok(due === 0 && s.visible.length === 0, '5.4 момент преди пускането на часовника не отваря бележка', { due, s: s.visible });

        // След като часовникът е тръгнал по-рано, същият момент вече звъни - за да не е празна проверката.
        await page.evaluate((note) => {
            allNotesData = [note];
            calendarBell.restart(Date.now() - 3600 * 1000);
        }, old);
        due = await tick(page);
        await page.waitForTimeout(500);
        s = await state(page);
        ok(due === 1 && s.visible.length === 1 && s.visible[0].id === 'D3',
            '5.5 същата бележка звъни и се отваря, когато часовникът е тръгнал по-рано', { due, s: s.visible });
    }
    ok(errs.length === 0, '5.6 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

// --- 6. Камбанката се връща към календарчето след своите 10 секунди ---
{
    const { ctx, page, errs, ready } = await openApp();
    ok(ready, '6.1 приложението стартира');
    if (ready) {
        const note = await dueNote(page, 'E');
        await reset(page, [note]);
        await tick(page);
        await page.waitForTimeout(500);
        let s = await state(page);
        ok(s.active && s.bellFlashing, '6.2 камбанката е вдигната', s);
        const t0 = await page.evaluate(() => calendarBell.state().until);
        await page.evaluate((t) => calendarBell.expire(t + 1000), t0);
        await page.waitForTimeout(400);
        s = await state(page);
        ok(!s.active && !s.bellFlashing && s.bellKey !== 'calendarBellTooltip', '6.3 след 10 секунди камбанката се връща към календарчето', s);
        ok(s.visible.length === 1 && s.visible[0].id === 'E', '6.4 отворената бележка остава отворена', s.visible);
    }
    ok(errs.length === 0, '6.5 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

// --- 7. Статична проверка: версията на кеша е вдигната ---
{
    const sw = await readFile(path.join(root, 'sw.js'), 'utf8').catch(() => '');
    const m = sw.match(/const CACHE_NAME = '([^']+)'/);
    ok(!!m, '7.1 sw.js има CACHE_NAME', m && m[0]);
    ok(!!m && m[1] !== 'nomn-1.1', '7.2 кешът е с нова версия, за да стигне промяната до телефона', m && m[1]);
}

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? 'FAILED' : 'OK');
process.exit(fails ? 1 : 0);
