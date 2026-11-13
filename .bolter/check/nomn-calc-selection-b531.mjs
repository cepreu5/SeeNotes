// nomn b5.31: калкулаторът при маркиран текст в режим Преглед.
// Собственик (13.11.2026): „Ако маркирам последните 3 реда цялостно и натисна Калкулатор се получава
// резултата от първата снимка, ако маркирам същото точно до края на последния ред - втората снимка.
// Освен това при маркиран текст (в режим преглед) резултата се влияе от съдържанието на клипборда.“
// Искане: в Преглед при маркиран текст да се събират числата от края на редовете (включително
// последния, чийто край на реда може да не влиза в маркировката) и да се показва и изразът на нов
// ред; в Редактиране резултатът да е израз и след текста на бележката; съобщението за невалиден
// израз да показва и израза; цялата бележка през копиране и клик/контрол клик не се променя.
//
// Проверява се в истински Chromium (?demo=1, 390x844):
//   1) статично: интервалите около оператор се махат само след буква-проверка, има
//      rememberCalcSelection и pointerdown, грешката носи израза, sw.js е nomn-b5.31;
//   2) extractAndFormat: табулатори и тръби дават 73.32+16.85+19.10, старите случаи не се пипат;
//   3) Преглед: маркирани последни 3 реда (до края на реда и цялостно) дават
//      „73.32+16.85+19.10 = 109.27“, а клипбордът не влияе;
//   4) Преглед без маркировка: пак се чете клипбордът и се показва израз = резултат;
//   5) Редактиране: изразът и резултатът отиват след текста на бележката;
//   6) невалиден израз: съобщението показва и самия израз;
//   7) няма грешки в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-calc-selection-b531.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
    'playwright'
].find(p => p === 'playwright' || existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = [
    '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome'
].find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'nomn');
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
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
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
    if (!cond) fails++;
};
const done = async (browser) => {
    if (browser) await browser.close();
    srv.close();
    console.log(fails ? 'FAILED' : `OK ${n - fails}/${n}`);
    process.exit(fails ? 1 : 0);
};

// --- 1. Статично -------------------------------------------------------------------------------
const mainJs = await readFile(path.join(root, 'main.js'), 'utf8');
const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
ok(/if \(\/\\p\{L\}\/u\.test\(before\)\) return match;/.test(mainJs),
    'интервалите около оператор не се махат, ако операторът е залепен за буква');
ok(/const before = offset > 0 \? whole\.charAt\(offset - 1\) : '';/.test(mainJs),
    'проверката гледа знака преди оператора');
ok(/function rememberCalcSelection\(\)/.test(mainJs) && /addEventListener\('pointerdown', rememberCalcSelection/.test(mainJs),
    'маркировката се запомня при натискане на бутона');
ok(/const errorMessage = `\$\{_\('invalidExpression'\)\} \$\{badExpression\}`;/.test(mainJs),
    'съобщението за невалиден израз носи и израза');
ok(/const calcLine = `\$\{sanitizedExpression\} = \$\{formattedResult\}`;/.test(mainJs),
    'показва се редът „израз = резултат“');
ok(/CACHE_NAME = 'nomn-b5\.31'/.test(sw), 'sw.js е вдигнат на nomn-b5.31');

// --- 2-7. Живият път ---------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: CHROME });
const errs = [];

const newCtx = async () => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
        serviceWorkers: 'block'
    });
    try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN }); } catch { }
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    return ctx;
};
const stubGlobals = async (page) => {
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await page.addInitScript(() => {
        const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
        window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
        window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
        window.kofiWidgetOverlay = { draw() { } };
        window.kofiwidget2 = { init() { }, draw() { } };
        localStorage.setItem('useIndexedDb', 'true');
        localStorage.setItem('useGoogleDb', 'false');
        localStorage.setItem('useLocalDb', 'false');
        localStorage.setItem('useLocalFolder', 'false');
        localStorage.setItem('useArhDb', 'false');
        localStorage.setItem('updateFromSource', 'false');
        localStorage.setItem('language', 'bg');
        localStorage.setItem('hideAssistant', 'true');
    });
};
const openFirstNote = async (page) => {
    await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    if (!ready) return false;
    await page.locator('#notes-container .note').first().click();
    return await page.waitForSelector('.note-window.visible .nw-modal-body', { timeout: 8000 }).then(() => true, () => false);
};

// ── 2. Извличането ─────────────────────────────────────────────────────────────────────────────
const TAB_TEXT = 'Лидл Бойко\t\t73.32\nКалояново\t\t16.85\nСопрал+\t\t19.10';
const PIPE_TEXT = '| Лидл Бойко |   | 73.32 |\n| Калояново  |   | 16.85 |\n| Сопрал+    |   | 19.10';
{
    const ctx = await newCtx();
    const page = await ctx.newPage();
    await stubGlobals(page);
    ok(await openFirstNote(page), 'приложението се вдигна и бележката се отвори');
    const cases = [
        [TAB_TEXT, '73.32+16.85+19.10', '2.1 табулатори: трите реда влизат'],
        [TAB_TEXT + '\n', '73.32+16.85+19.10', '2.2 табулатори с нов ред накрая'],
        [PIPE_TEXT, '73.32+16.85+19.10', '2.3 тръби: трите реда влизат'],
        ['Сопрал+ 19.10', '19.10', '2.4 „Сопрал+ 19.10“ дава 19.10'],
        ['180 + 247', '180+247', '2.5 интервалите между цифри още се махат'],
        ['180+247', '180+247', '2.6 изразът в реда не се пипа'],
        ['сума 500 А1', '', '2.7 залепено за буква число не се брои'],
        ['сума 500лв', '', '2.8 букви след числото — редът не дава нищо'],
        ['|746.99|', '746.99', '2.9 число между тръби се брои'],
        ['Мляко 2,50\nХляб 1,30', '2.50+1.30', '2.10 запетая и два реда'],
        ['1. Мляко 2.50', '2.50', '2.11 номерация в началото']
    ];
    for (const [inp, exp, tag] of cases) {
        const got = await page.evaluate(t => window.extractAndFormat(t), inp);
        ok(got === exp, `${tag}: „${inp.replace(/\n/g, ' | ')}“ → „${exp}“`, got);
    }
    await ctx.close();
}

// ── 3-4-6. Преглед: маркиран текст, клипборд, невалиден израз ────────────────────────────────
const TABLE_HTML = `<table class="note-table"><tbody>
<tr><td>Кауфланд</td><td></td><td>29.12</td></tr>
<tr><td>Лидл</td><td></td><td>64.56</td></tr>
<tr><td>Бензин</td><td></td><td>74.72</td></tr>
<tr><td>вода</td><td></td><td>22.90</td></tr>
<tr><td>Лидл</td><td></td><td>14.53</td></tr>
<tr><td>-</td><td>-</td><td>-</td></tr>
<tr><td>Лидл Бойко</td><td></td><td>73.32</td></tr>
<tr><td>Калояново</td><td></td><td>16.85</td></tr>
<tr><td>Сопрал+</td><td></td><td>19.10</td></tr>
</tbody></table>`;

const injectTable = (page) => page.evaluate(html => {
    const body = document.querySelector('.note-window.visible .nw-modal-body');
    let host = document.getElementById('probe-table-host');
    if (host) host.remove();
    host = document.createElement('div');
    host.id = 'probe-table-host';
    host.innerHTML = html;
    body.appendChild(host);
    window.getSelection().removeAllRanges();
}, TABLE_HTML);

const selectLastThree = (page, mode) => page.evaluate(m => {
    const host = document.getElementById('probe-table-host');
    const rows = host.querySelectorAll('tr');
    const first = rows[6].firstElementChild.firstChild;
    const lastCell = rows[8].lastElementChild;
    const r = document.createRange();
    r.setStart(first, 0);
    if (m === 'to-end-of-line') {
        const t = lastCell.firstChild;
        r.setEnd(t, t.textContent.length);
    } else {
        r.setEnd(lastCell, lastCell.childNodes.length);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return sel.toString();
}, mode);

const bodyText = (page) => page.evaluate(() => (document.querySelector('.note-window.visible .nw-modal-body') || {}).textContent || '');
const clickCalc = async (page) => {
    await page.locator('.note-window-active .nw-calculate-modal-btn').first().click();
    await page.waitForTimeout(800);
};

{
    const ctx = await newCtx();
    const page = await ctx.newPage();
    await stubGlobals(page);
    ok(await openFirstNote(page), '3.0 бележката се отвори за проверката в Преглед');

    for (const [mode, tag] of [['to-end-of-line', '3.1 маркировка до края на последния ред'], ['whole-row', '3.2 маркировка на редовете цялостно']]) {
        await injectTable(page);
        // Клипбордът е отровен нарочно: резултатът не бива да зависи от него
        await page.evaluate(() => navigator.clipboard.writeText('111+222'));
        const marked = await selectLastThree(page, mode);
        ok(marked.includes('19.10'), `${tag}: маркировката стига до 19.10`, marked);
        await clickCalc(page);
        const text = (await bodyText(page)).trimEnd();
        ok(text.endsWith('73.32+16.85+19.10 = 109.27'), `${tag}: показва се „73.32+16.85+19.10 = 109.27“`, text.slice(-70));
        ok(!text.includes('333'), `${tag}: клипбордът (111+222) не се използва`, text.slice(-70));
    }

    // 4) без маркировка — чете се клипбордът и пак се вижда изразът
    await injectTable(page);
    await page.evaluate(() => { window.getSelection().removeAllRanges(); });
    await page.evaluate(() => navigator.clipboard.writeText('мляко 2.50\nхляб 1.30'));
    await clickCalc(page);
    const clipText = (await bodyText(page)).trimEnd();
    ok(clipText.endsWith('2.50+1.30 = 3.80'), '4.1 без маркировка: изразът и резултатът от клипборда', clipText.slice(-60));

    // 6) невалиден израз — съобщението показва и израза
    await injectTable(page);
    await page.evaluate(() => {
        const host = document.getElementById('probe-table-host');
        const cell = host.querySelectorAll('tr')[8].firstElementChild.firstChild;
        const r = document.createRange();
        r.setStart(cell, 0);
        r.setEnd(cell, 'Сопрал+'.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
    });
    await clickCalc(page);
    const errText = (await bodyText(page)).trimEnd();
    ok(/Невалиден математически израз\.\s*Сопрал\+/.test(errText), '6.1 съобщението носи и самия израз', errText.slice(-80));

    await ctx.close();
}

// ── 5. Редактиране: изразът отива след текста на бележката ────────────────────────────────────
{
    const ctx = await newCtx();
    const page = await ctx.newPage();
    await stubGlobals(page);
    ok(await openFirstNote(page), '5.0 бележката се отвори за проверката в Редактиране');
    const edit = await page.evaluate(() => {
        const body = document.querySelector('.note-window.visible .nw-modal-body') || document.getElementById('modal-body');
        if (typeof enableNoteEditing === 'function') enableNoteEditing(body, -1);
        const editor = document.getElementById('note-edit-textarea');
        return { ok: !!editor && editor.offsetParent !== null };
    });
    ok(edit.ok === true, '5.1 бележката влиза в редакция', edit);

    const prepared = await page.evaluate(() => {
        const editor = document.getElementById('note-edit-textarea');
        editor.value = 'Сметка\n\nПърви 10.50\nВтори 5.25';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        const start = editor.value.indexOf('Първи');
        editor.setSelectionRange(start, editor.value.length);
        editor.focus();
        return { start, sel: editor.value.slice(editor.selectionStart, editor.selectionEnd) };
    });
    ok(prepared.sel.includes('10.50') && prepared.sel.includes('5.25'), '5.2 в полето са маркирани двата реда', prepared);

    await clickCalc(page);
    const after = await page.evaluate(() => document.getElementById('note-edit-textarea').value);
    ok(after.trimEnd().endsWith('10.50+5.25 = 15.75'), '5.3 след текста на бележката стои „10.50+5.25 = 15.75“', after.slice(-80));
    ok(after.startsWith('Сметка'), '5.4 старият текст на бележката е запазен', after.slice(0, 40));

    await ctx.close();
}

ok(errs.length === 0, 'няма грешки в конзолата', errs.slice(0, 4));
await done(browser);
