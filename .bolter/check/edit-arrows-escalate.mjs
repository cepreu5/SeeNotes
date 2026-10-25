// Стрелките ← / → сменят глифа си на ↑ / ↓ след задържане, когато второ задържане би преместило
// каретата в началото/края на ЦЕЛИЯ текст (b2.83).
// Собственикът (25.10.2026): „В режим редактиране след първото задържане на бутона със стрелка, когато
// курсорът отиде в началото/края на реда, стрелката да се сменя със стрелка нагоре/надолу, така че
// потребителят да вижда че ако задържи отново ще премести курсорът в началото/края. При първо
// преместване на курсора, независимо в рамките на реда, на друг ред или в началото/края на текста,
// стрелките се възстановяват както са първоначално."
// Проверява се в истинска страница (uni/ в локален режим, без Google Drive), с ИСТИНСКО задържане на
// показалеца (mousedown, 650ms, mouseup) върху бутона - същият път, който ползва пръстът на телефона:
//   1) карета в средата на ДЪЛЪГ (пренасящ се) ред + задържане на „→" => каретата е в края на
//      ВИЗУАЛНИЯ ред (не в края на абзаца), глифът на „→" е „↓", а „←" си остава „←";
//   2) едно преместване на каретата => глифът се връща на „→" - по ВСЕКИ път: клик на стрелката,
//      клавиш, писане, клик в текста, смяна на селекцията, смяна на активния редактор;
//   3) същото за „←" => „↑" в началото на визуалния ред;
//   4) второ задържане стига до началото/края на ЦЕЛИЯ текст, а тогава глифът НЕ се сменя (повече
//      няма накъде) - „←"/„→" си остават.
// Пуска се от корена на хранилището:
//   node .bolter/check/edit-arrows-escalate.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

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
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 500) : ''));
    if (!cond) fails++;
};

// Chromium в сандбокса е под два номера: взимаме този, който наистина е на място.
const CHROME = [
    '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome',
    '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
].find(p => existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--num-raster-threads=4'] } : { args: ['--num-raster-threads=4'] });

// Тесен екран (390): дългият ред наистина се пренася на няколко визуални реда.
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block', hasTouch: true });
await ctx.addInitScript(() => {
    try {
        localStorage.setItem('language', 'bg');
        localStorage.setItem('hideAssistant', 'true');
        localStorage.setItem('notesBgrd', 'false');
        localStorage.setItem('singleNoteMode', 'false');
    } catch (e) { }
});
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof version !== 'undefined' && version && typeof startApp === 'function', null, { timeout: 20000 });
await page.evaluate(async () => { if (!contentModal) await startApp().catch(() => { }); });
await page.waitForFunction(() => !!contentModal, null, { timeout: 20000 });
errs.length = 0; // шумът от стартирането без Drive не е наш

// Дълъг абзац, който се пренася: ръбът на ВИЗУАЛНИЯ ред е ВЪТРЕ в абзаца, не в края му.
const LINE1 = 'Първи ред';
const LONG = 'Дълъг ред, който се пренася на няколко визуални реда, за да има ръб на реда вътре в абзаца'
    + ' и още достатъчно думи, за да стигне до трети визуален ред на тесен екран, където се проверява';
const LINE3 = 'Последен ред';
const NOTE = `${LINE1}\n${LONG}\n${LINE3}`;
const P_START = NOTE.indexOf(LONG);              // началото на дългия абзац
const P_END = P_START + LONG.length;             // краят на дългия абзац (без \n)

// Бележка в режим на редактиране - по същия път като клик на картата на борда + молива.
const openEditing = (raw) => page.evaluate((raw) => {
    const now = Date.now();
    boardsData = boardsData.filter(b => b.gdid !== 'B1');
    boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' });
    allNotesData = allNotesData.filter(x => String(x.id) !== '777');
    allNotesData.push({
        alarm_type: -1, boardid: 'B1', calendarDate: 0, color: 0, date: now - 60000, datemod: now - 30000,
        eventId: 0, gdid: 'GN777', id: 777, notetxt: raw, numord: 1, sellist: 0, status: 0,
        text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1,
    });
    showModal({ raw, id: 777, gdid: 'GN777', boardId: 'B1', forceShowBoardName: true });
    enableNoteEditing(document.getElementById('modal-body'));
}, raw);
await openEditing(NOTE);
await page.waitForSelector('#content-modal .modal-edit-toolbar', { timeout: 8000 });
await page.waitForSelector('#note-edit-textarea', { timeout: 8000 });
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

const BOX = '#content-modal .modal-content-box';
const LEFT = `${BOX} .modal-edit-toolbar .is-caret-left`;
const RIGHT = `${BOX} .modal-edit-toolbar .is-caret-right`;

// Глифовете на двете стрелки (и какво казват на потребителя).
const glyphs = () => page.evaluate(([leftSel, rightSel]) => {
    const read = (sel) => {
        const b = document.querySelector(sel);
        if (!b) return null;
        return {
            glyph: (b.textContent || '').trim(),
            title: b.getAttribute('title') || '',
            aria: b.getAttribute('aria-label') || '',
            escalated: b.classList.contains('is-escalated'),
            dataGlyph: b.dataset.glyph || '',
        };
    };
    return { left: read(leftSel), right: read(rightSel) };
}, [LEFT, RIGHT]);

// Каретата в редактора + границите на дългия абзац.
const caretState = () => page.evaluate(() => {
    const t = document.getElementById('note-edit-textarea');
    const v = t.value;
    const firstNl = v.indexOf('\n');
    const lastNl = v.lastIndexOf('\n');
    const pStart = firstNl + 1;
    const pEnd = lastNl;
    const caret = t.selectionStart;
    // Ръб на ВИЗУАЛНИЯ ред по собственото определение на приложението - за да се види, че задържането
    // спира ТАМ, а не в края на абзаца.
    const visualStart = typeof getVisualLineEdge === 'function' ? getVisualLineEdge(t, Math.min(caret, pEnd), pStart, pEnd, false) : null;
    const visualEnd = typeof getVisualLineEdge === 'function' ? getVisualLineEdge(t, Math.min(caret, pEnd), pStart, pEnd, true) : null;
    return {
        caret, end: t.selectionEnd, len: v.length, pStart, pEnd, visualStart, visualEnd,
        focused: document.activeElement === t,
        charBefore: v[caret - 1] === undefined ? null : v[caret - 1],
        charAt: v[caret] === undefined ? null : v[caret],
    };
});

const setCaret = (pos) => page.evaluate((pos) => {
    const t = document.getElementById('note-edit-textarea');
    t.focus();
    t.setSelectionRange(pos, pos);
    return { caret: t.selectionStart };
}, pos);

const centre = async (sel) => {
    const loc = page.locator(sel);
    await loc.scrollIntoViewIfNeeded().catch(() => { });
    const b = await loc.boundingBox();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
};

// ИСТИНСКО задържане на показалеца върху бутона (както пръст на телефона).
const holdArrow = async (sel, ms = 650) => {
    const pt = await centre(sel);
    if (!pt) return false;
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
    await page.waitForTimeout(60);
    return true;
};
const clickArrow = async (sel) => {
    const pt = await centre(sel);
    if (!pt) return false;
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(60);
    return true;
};
const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// --- 1) Изходно: двете стрелки са ← и →, нито един не е „вдигнат" ----------------------------
let g = await glyphs();
ok(g.left && g.left.glyph === '←', `изходно лявата стрелка е „←" (${g.left && g.left.glyph})`, g);
ok(g.right && g.right.glyph === '→', `изходно дясната стрелка е „→" (${g.right && g.right.glyph})`, g);
ok(g.left && !g.left.escalated && g.right && !g.right.escalated, 'изходно нито един бутон не е в състояние „вдигнат"', g);

// Позиция на карета, чийто ВИЗУАЛЕН ред е пренасят (ръбовете му са ВЪТРЕ в абзаца) - точно случаят,
// в който второ задържане има накъде да води.
const findWrapped = () => page.evaluate(() => {
    const t = document.getElementById('note-edit-textarea');
    const v = t.value;
    const pStart = v.indexOf('\n') + 1;
    const pEnd = v.lastIndexOf('\n');
    for (let pos = pStart + 5; pos < pEnd - 5; pos++) {
        const vs = getVisualLineEdge(t, pos, pStart, pEnd, false);
        const ve = getVisualLineEdge(t, pos, pStart, pEnd, true);
        // Каретата трябва да е СТРИКТНО вътре във визуалния ред - иначе „задържане" веднага е на ръба
        // и второ задържане би отскочило до началото/края на целия текст.
        if (vs > pStart && ve < pEnd && pos > vs + 2 && pos < ve - 2) return { pos, vs, ve, pStart, pEnd };
    }
    return null;
});
const wrapped = await findWrapped();
ok(!!wrapped, `дългият абзац се пренася на няколко визуални реда (${wrapped && `${wrapped.pStart}..${wrapped.pEnd}, ред ${wrapped.vs}..${wrapped.ve}`})`, wrapped);

// --- 2) Задържане на „→": каретата спира в края на ВИЗУАЛНИЯ ред, глифът става „↓" -----------
{
    await setCaret(wrapped.pos);
    const held = await holdArrow(RIGHT);
    await settle();
    const st = await caretState();
    g = await glyphs();
    ok(held, 'задържането на „→" с показалеца минава');
    ok(st.caret === wrapped.ve, `след задържане каретата е в края на ВИЗУАЛНИЯ ред (${st.caret}, чакаме ${wrapped.ve})`, { st, wrapped });
    ok(st.caret < st.pEnd && st.caret > st.pStart,
        `това не е краят на абзаца, а ръб на пренасящ се ред (${st.caret} < ${st.pEnd})`, st);
    ok(g.right.glyph === '↓', `глифът на „→" става „↓" (${g.right.glyph})`, g);
    ok(g.right.escalated === true, 'бутонът е маркиран като „вдигнат" (клас is-escalated)', g);
    ok(g.left.glyph === '←' && g.left.escalated === false,
        `сменя се САМО задържаният бутон - „←" си остава „←" (${g.left.glyph})`, g);
    ok(/целия текст/i.test(g.right.title) && /целия текст/i.test(g.right.aria),
        `подсказката на „↓" казва, че води до края на целия текст („${g.right.title}")`, g.right);
    ok(g.right.dataGlyph === '↓', `данните на бутона носят глифа „↓" (${g.right.dataGlyph})`, g.right);

    // --- 3) Едно преместване на каретата (клик на самата стрелка) връща глифа -------------------
    await clickArrow(RIGHT);
    await settle();
    const st2 = await caretState();
    g = await glyphs();
    ok(st2.caret === wrapped.ve + 1, `кликът на „→" мести каретата с един знак (${wrapped.ve} -> ${st2.caret})`, st2);
    ok(g.right.glyph === '→' && g.right.escalated === false,
        `след първото преместване глифът е пак „→" (${g.right.glyph})`, g);
    ok(g.left.glyph === '←', `и „←" си остава „←" (${g.left.glyph})`, g);
    ok(/един знак надясно/i.test(g.right.title), `подсказката се връща на „един знак надясно" („${g.right.title}")`, g.right);
}

// --- 4) Второ задържане стига до края на ЦЕЛИЯ текст; там глифът НЕ се сменя ------------------
{
    await setCaret(wrapped.pos);
    await holdArrow(RIGHT);
    await settle();
    const first = await caretState();
    ok((await glyphs()).right.glyph === '↓', `първото задържане вдига глифа на „↓" (${first.caret})`, first);
    await holdArrow(RIGHT);
    await settle();
    const second = await caretState();
    g = await glyphs();
    ok(second.caret === second.len, `второто задържане стига до края на целия текст (${second.caret} от ${second.len})`, second);
    ok(g.right.glyph === '→' && g.right.escalated === false,
        `на края на целия текст „→" си остава „→" - повече няма накъде (${g.right.glyph})`, g);
    ok(/един знак надясно/i.test(g.right.title), `и подсказката е пак първоначалната („${g.right.title}")`, g.right);
}

// --- 5) Задържане на „←": началото на ВИЗУАЛНИЯ ред, глифът става „↑" ------------------------
{
    await setCaret(wrapped.pos);
    await holdArrow(LEFT);
    await settle();
    const st = await caretState();
    g = await glyphs();
    ok(st.caret === wrapped.vs, `след задържане на „←" каретата е в началото на ВИЗУАЛНИЯ ред (${st.caret}, чакаме ${wrapped.vs})`, { st, wrapped });
    ok(st.caret > st.pStart, `това не е началото на абзаца (${st.caret} > ${st.pStart})`, st);
    ok(g.left.glyph === '↑' && g.left.escalated === true, `глифът на „←" става „↑" (${g.left.glyph})`, g);
    ok(g.right.glyph === '→' && g.right.escalated === false, `сменя се само „←" - „→" си остава „→" (${g.right.glyph})`, g);
    ok(/целия текст/i.test(g.left.title), `подсказката на „↑" казва, че води до началото на целия текст („${g.left.title}")`, g.left);

    // второ задържане -> началото на целия текст, глифът се връща
    await holdArrow(LEFT);
    await settle();
    const second = await caretState();
    g = await glyphs();
    ok(second.caret === 0, `второто задържане стига до началото на целия текст (${second.caret})`, second);
    ok(g.left.glyph === '←' && g.left.escalated === false,
        `в началото на целия текст „←" си остава „←" (${g.left.glyph})`, g);
}

// --- 6) Всяко преместване на каретата връща глифовете - по всички пътища --------------------
// Общо: каретата се слага в средата на пренасящ се ред, задържа се „→" (глифът става „↓") и след това
// каретата се мести по ЕДИН от пътищата. Глифът трябва да е пак „→".
const armDown = async () => {
    const w = await findWrapped();
    await setCaret(w.pos);
    await holdArrow(RIGHT);
    await settle();
    const armed = await glyphs();
    return { w, armed };
};
{
    // 6а) клавиш (keyup)
    let a = await armDown();
    ok(a.armed.right.glyph === '↓', `6а) преди проверката глифът е „↓" (${a.w && a.w.pos})`, a.armed);
    await page.keyboard.press('ArrowLeft');
    await settle();
    g = await glyphs();
    const stKey = await caretState();
    ok(g.right.glyph === '→' && g.right.escalated === false,
        `6а) клавиш в редактора връща „→" (карета ${stKey.caret})`, g);

    // 6б) писане (input)
    a = await armDown();
    ok(a.armed.right.glyph === '↓', '6б) изходно „↓" преди писането', a.armed);
    // Пише се в КРАЯ на текста, за да не се размества дългият абзац, и след това се изтрива.
    const beforeLen = await page.evaluate(() => {
        const t = document.getElementById('note-edit-textarea');
        t.focus();
        t.setSelectionRange(t.value.length, t.value.length);
        return t.value.length;
    });
    await page.keyboard.type('ж');
    await settle();
    g = await glyphs();
    const typed = await page.evaluate(() => document.getElementById('note-edit-textarea').value);
    ok(g.right.glyph === '→' && g.right.escalated === false,
        `6б) писане в редактора връща „→" (текстът е ${typed.length} знака)`, g);
    ok(typed.length === beforeLen + 1, `6б) знакът наистина е въведен (${beforeLen} -> ${typed.length})`, { beforeLen, typed });
    await page.keyboard.press('Backspace');
    await settle();
    const afterBack = await page.evaluate(() => document.getElementById('note-edit-textarea').value.length);
    ok(afterBack === beforeLen, `6б) и изтрит - текстът е както преди проверката (${afterBack})`, { beforeLen, afterBack });

    // 6в) клик в текста (mouseup/click)
    a = await armDown();
    ok(a.armed.right.glyph === '↓', '6в) изходно „↓" преди клика в текста', a.armed);
    const tBox = await page.evaluate(() => {
        const t = document.getElementById('note-edit-textarea');
        const r = t.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await page.mouse.click(tBox.x, tBox.y);
    await settle();
    g = await glyphs();
    ok(g.right.glyph === '→' && g.right.escalated === false, `6в) клик в текста връща „→" (${tBox.x},${tBox.y})`, g);

    // 6г) смяна на селекцията (selectionchange) без клавиш и без клик
    a = await armDown();
    ok(a.armed.right.glyph === '↓', '6г) изходно „↓" преди смяната на селекцията', a.armed);
    await page.evaluate(() => {
        const t = document.getElementById('note-edit-textarea');
        t.setSelectionRange(2, 2);
    });
    await settle();
    g = await glyphs();
    ok(g.right.glyph === '→' && g.right.escalated === false, '6г) смяна на селекцията връща „→"', g);

    // 6д) смяна на активния редактор (заглавието на бележката), ако полето съществува
    const titleSel = `${BOX} #note-edit-title-textarea`;
    const hasTitle = await page.evaluate((sel) => !!document.querySelector(sel), titleSel);
    if (hasTitle) {
        a = await armDown();
        ok(a.armed.right.glyph === '↓', '6д) изходно „↓" преди смяната на редактора', a.armed);
        await page.locator(titleSel).click();
        await settle();
        g = await glyphs();
        ok(g.right.glyph === '→' && g.right.escalated === false, '6д) фокусът в полето за заглавие връща „→"', g);
    } else {
        console.log('   (6д) няма поле за заглавие в този режим - проверката за смяна на редактора се прескача');
    }
}

// --- 7) Няма накъде повече: в началото/края на целия текст глифът НЕ се сменя ----------------
{
    await setCaret(0);
    await holdArrow(LEFT);
    await settle();
    let st = await caretState();
    g = await glyphs();
    ok(st.caret === 0 && g.left.glyph === '←' && g.left.escalated === false,
        `в началото на целия текст задържане на „←" не сменя глифа (карета ${st.caret}, глиф ${g.left.glyph})`, { st, g });

    await setCaret(st.len);
    await holdArrow(RIGHT);
    await settle();
    st = await caretState();
    g = await glyphs();
    ok(st.caret === st.len && g.right.glyph === '→' && g.right.escalated === false,
        `в края на целия текст задържане на „→" не сменя глифа (карета ${st.caret}/${st.len}, глиф ${g.right.glyph})`, { st, g });

    // Първият ред започва от началото на текста: задържане на „←" стига до 0, значи няма накъде.
    await setCaret(2);
    await holdArrow(LEFT);
    await settle();
    st = await caretState();
    g = await glyphs();
    ok(st.caret === 0 && g.left.glyph === '←',
        `на първия ред „←" стига до началото на текста и глифът си остава „←" (карета ${st.caret})`, { st, g });

    // Последният ред свършва с края на текста: същото за „→".
    await setCaret(st.len - 3);
    await holdArrow(RIGHT);
    await settle();
    st = await caretState();
    g = await glyphs();
    ok(st.caret === st.len && g.right.glyph === '→',
        `на последния ред „→" стига до края на текста и глифът си остава „→" (карета ${st.caret}/${st.len})`, { st, g });
}

// --- 8) Същото и по пътя на пръста (touchstart -> 500ms -> touchend) -------------------------
// На телефон задържането идва като touch, а не като мишка: бутонът има отделен слушател за него, значи
// се проверява и той. Събитията са истински TouchEvent-и върху самия бутон.
{
    const wrapped2 = await findWrapped();
    await setCaret(wrapped2.pos);
    const touched = await page.evaluate(async ([sel]) => {
        const button = document.querySelector(sel);
        if (!button) return { started: false };
        const r = button.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const make = (type, active) => {
            const touch = new Touch({ identifier: 21, target: button, clientX: cx, clientY: cy });
            const list = active ? [touch] : [];
            return new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: [touch] });
        };
        button.dispatchEvent(make('touchstart', true));
        await new Promise(res => setTimeout(res, 650));
        const glyphDuring = (button.textContent || '').trim();
        button.dispatchEvent(make('touchend', false));
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        return { started: true, glyphDuring, glyphAfter: (button.textContent || '').trim() };
    }, [RIGHT]);
    ok(touched.started, 'задържането с пръст върху „→" минава');
    const stTouch = await caretState();
    g = await glyphs();
    ok(stTouch.caret === wrapped2.ve, `пръстът също мести каретата в края на визуалния ред (${stTouch.caret}, чакаме ${wrapped2.ve})`, { stTouch, wrapped2 });
    ok(touched.glyphDuring === '↓', `по време на задържането с пръст глифът е „↓" (${touched.glyphDuring})`, touched);
    ok(g.right.glyph === '↓' && g.right.escalated === true,
        `и след пускането глифът остава „↓" до първото местене на каретата (${g.right.glyph})`, g);
    // Първото местене (клавиш) го връща - същият път като при мишката.
    await page.keyboard.press('ArrowLeft');
    await settle();
    g = await glyphs();
    ok(g.right.glyph === '→' && g.right.escalated === false, 'първото местене на каретата връща „→" и след задържане с пръст', g);
}

// --- 9) Никакви грешки в конзолата / страницата ----------------------------------------------
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`, errs.slice(0, 3));

await browser.close();
srv.close();
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);

