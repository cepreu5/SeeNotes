// Калкулаторът взима само последното число в реда и само ако не е залепено за буква (b3.72 / b1.89)
//
// Собственикът (5.11.2026): бележка с ред „180+247 БК, 500 А1“ дава 1+746.99+188.17+323.34 = 1259.50,
// тоест взима единицата от „А1“. Искане: „взима се само последното число в реда и то ако има
// един интервал преди него“.
//
// Какво проверява (истински Chromium, истинският код):
//   1) uni: функцията extractAndFormat върху точния текст на бележката дава 746.99+188.17+323.34;
//   2) uni: същият текст през бутона на калкулатора (от клипборда) се записва като „… = 1258.50“,
//      а старият резултат 1259.50 (с единицата от „А1“) не се появява;
//   3) uni: ако последното число в реда е залепено за буква (А1, A1, T1, А4), редът не дава нищо —
//      не се връща към по-раншно число от същия ред;
//   4) uni: старото поведение не е пипано (израз, номерация в началото, запетая, скоби, тръби);
//   5) MNV: същата функция върху същия текст дава същото;
//   6) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/calc-skips-glued-digits.mjs   (exit 1 при провал)
// ROOT=… сочи друго дърво на хранилището (за контролата върху стария код).
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

const root = path.resolve(process.env.ROOT || '.');

// Точният текст на бележката от собственика (id 1000580)
const NOTE = [
    'TBI neon',
    '',
    '180+247 БК, 500 А1',
    '| потребител   |   сума | разсрочен |',
    '| ------------ | -----: | :-------: |',
    '| [x] Мой      | 746.99 |    [ ]    |',
    '| [x] Тоньо    | 188.17 |    [ ]    |',
    '| [x] Светлана | 323.34 |    [x]    |'
].join('\n');
const WANT_EXPR = '746.99+188.17+323.34';
const WANT_SUM = '1258.50';

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
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME });

const newCtx = async (grantClipboard) => {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
    if (grantClipboard) {
        try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN }); } catch { }
    }
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    return ctx;
};

const stubGlobals = async (page) => {
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

// ── 1. uni: функцията върху точния текст на бележката ───────────────────────────
let uniErrs = [];
{
    const ctx = await newCtx(false);
    const page = await ctx.newPage();
    page.on('pageerror', e => uniErrs.push(String(e.message).slice(0, 200)));
    await stubGlobals(page);
    await page.goto(`${ORIGIN}/uni/index.html?demo=1`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const has = await page.evaluate(() => typeof window.extractAndFormat === 'function');
    ok(has, '1.1 uni: extractAndFormat е налична в страницата');
    if (has) {
        const got = await page.evaluate(t => window.extractAndFormat(t), NOTE);
        ok(got === WANT_EXPR, '1.2 uni: изразът от бележката на собственика', got);
        const sum = await page.evaluate(e => { try { return new Function('return ' + e)().toFixed(2); } catch (x) { return 'ERR ' + x.message; } }, got);
        ok(sum === WANT_SUM, '1.3 uni: резултатът е 1258.50, не 1259.50', sum);

        // ── 3. само последното число в реда, и само ако не е залепено за буква ──
        const cases = [
            ['клетка А1', '', '3.1'],
            ['Т1', '', '3.2'],
            ['Мой 746.99 А4', '', '3.3'],
            ['A1 250', '250', '3.4'],
            ['сума 500 А1', '', '3.5'],
            ['180+247 БК, 500 А1', '', '3.6'],
            ['500 А1 250', '250', '3.7'],
            ['сума 500 300', '300', '3.8'],
            ['сума 500лв', '500', '3.9']
        ];
        for (const [inp, exp, tag] of cases) {
            const got2 = await page.evaluate(t => window.extractAndFormat(t), inp);
            ok(got2 === exp, `${tag} uni: „${inp}“ → „${exp}“`, got2);
        }

        // ── 4. старото поведение остава ──
        const keep = [
            ['180+247', '180+247', '4.1'],
            ['1. Мляко 2.50', '2.50', '4.2'],
            ['☑ Мляко 2,50\n☑ Хляб 1,30', '2.50+1.30', '4.3'],
            ['|746.99|', '746.99', '4.4'],
            ['стойност (500)', '500', '4.5'],
            ['Мляко 2.50\nХляб 1.30', '2.50+1.30', '4.6'],
            ['500', '500', '4.7'],
            ['180+247 БК, 500 лв', '500', '4.8']
        ];
        for (const [inp, exp, tag] of keep) {
            const got3 = await page.evaluate(t => window.extractAndFormat(t), inp);
            ok(got3 === exp, `${tag} uni: „${inp.replace(/\n/g, ' | ')}“ → „${exp}“`, got3);
        }
    }
    await ctx.close();
}

// ── 2. uni: през бутона на калкулатора (от клипборда) ───────────────────────────
{
    const ctx = await newCtx(true);
    const page = await ctx.newPage();
    page.on('pageerror', e => uniErrs.push(String(e.message).slice(0, 200)));
    await stubGlobals(page);
    await page.goto(`${ORIGIN}/uni/index.html?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    ok(ready, '2.1 uni: демото зареди с бележки');
    if (ready) {
        await page.locator('#notes-container .note').first().click();
        await page.waitForTimeout(1200);
        const btn = page.locator('.note-window-active .nw-calculate-modal-btn');
        const btnCount = await btn.count();
        ok(btnCount > 0, '2.2 uni: бутонът на калкулатора е в отворената бележка', btnCount);
        if (btnCount > 0) {
            await page.evaluate(t => navigator.clipboard.writeText(t), NOTE);
            await btn.first().click();
            await page.waitForTimeout(1500);
            const body = await page.evaluate(() => (document.querySelector('.note-window-active .nw-modal-body') || {}).textContent || '');
            const flat = body.replace(/\s+/g, ' ');
            ok(flat.includes(`${WANT_EXPR} = ${WANT_SUM}`), '2.3 uni: в бележката се записва „… = 1258.50“', flat.slice(-140));
            ok(!flat.includes('1259.50'), '2.4 uni: никъде не се появява старият резултат 1259.50', flat.slice(-140));
        }
    }
    await ctx.close();
}

// ── 5. MNV: същата функция върху същия текст ──────────────────────────────────
let mnvErrs = [];
{
    const ctx = await newCtx(false);
    const page = await ctx.newPage();
    page.on('pageerror', e => mnvErrs.push(String(e.message).slice(0, 200)));
    await stubGlobals(page);
    await page.goto(`${ORIGIN}/MNV/index-2.html`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const has = await page.evaluate(() => typeof window.extractAndFormat === 'function');
    ok(has, '5.1 MNV: extractAndFormat е налична в страницата');
    if (has) {
        const got = await page.evaluate(t => window.extractAndFormat(t), NOTE);
        ok(got === WANT_EXPR, '5.2 MNV: изразът от бележката на собственика', got);
        const sum = await page.evaluate(e => { try { return new Function('return ' + e)().toFixed(2); } catch (x) { return 'ERR ' + x.message; } }, got);
        ok(sum === WANT_SUM, '5.3 MNV: резултатът е 1258.50', sum);
        const glued = await page.evaluate(() => window.extractAndFormat('клетка А1'));
        ok(glued === '', '5.4 MNV: „клетка А1“ не дава число', glued);
        const gluedLast = await page.evaluate(() => window.extractAndFormat('сума 500 А1'));
        ok(gluedLast === '', '5.5 MNV: „сума 500 А1“ не дава нищо (последното е залепено)', gluedLast);
        const expr = await page.evaluate(() => window.extractAndFormat('180+247'));
        ok(expr === '180+247', '5.6 MNV: чист израз минава както преди', expr);
    }
    await ctx.close();
}

// ── 6. конзолата ─────────────────────────────────────────────────────────────
const real = uniErrs.filter(e => !/clipboard|NotAllowed|permission|ResizeObserver|gapi|google/i.test(e));
ok(real.length === 0, '6.1 uni: няма изключения в конзолата', real.slice(0, 3));
const realM = mnvErrs.filter(e => !/clipboard|NotAllowed|permission|ResizeObserver|gapi|google|idb|IndexedDB/i.test(e));
ok(realM.length === 0, '6.2 MNV: няма изключения в конзолата', realM.slice(0, 3));

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? 'FAILED' : 'OK');
process.exit(fails ? 1 : 0);
