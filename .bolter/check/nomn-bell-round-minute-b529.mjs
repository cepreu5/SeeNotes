// nomn b5.29: часовникът на календарната камбанка (проверката на датата и часа на бележките) се
// стартира подравнен към кръглата минута.
// Собственик (11.11.2026): „Нека таймерът който проверява датата на бележката на 20 секунди да се
// стартира така че тази проверка да става на кръгла минута“.
//
// Проверява се в истински Chromium с реален часовник (никакъв фалшив Date), като се мери кога
// действително гърмят таймерите на приложението:
//   1) статично: CAL_BELL_TICK_MS е пак 20000, има CAL_BELL_ROUND_MS = 60000, startCalendarBellClock
//      чака с setTimeout до кръглата минута и чак после пуска setInterval; sw.js е nomn-b5.29;
//   2) помощната функция смята правилно остатъка до кръглата минута;
//   3) след зареждане часовникът чака (няма пуснат setInterval на 20 сек) и заявката за изчакване е
//      точно до следващата :00.000;
//   4) първата проверка гърми на :00 секунди;
//   5) след нея проверките са на :20 и :40, на равни 20 сек, значи всяка кръгла минута е покрита;
//   6) часовникът е пуснат веднъж (един setInterval), без грешки в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-bell-round-minute-b529.mjs
// (тестът чака до ~90 сек, защото мери истински минутни граници)
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

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
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
ok(/const CAL_BELL_TICK_MS = 20000;/.test(mainJs), 'проверката остава на всеки 20 сек');
ok(/const CAL_BELL_ROUND_MS = 60000;/.test(mainJs), 'има константа за кръглата минута');
ok(/function calBellMsToRoundMinute\(now = Date\.now\(\)\)/.test(mainJs), 'има помощна функция за остатъка до минутата');
const startBlock = (mainJs.match(/function startCalendarBellClock\(\)[\s\S]*?\n\}/) || [''])[0];
ok(/setTimeout\(\(\) => \{[\s\S]*?calBellMsToRoundMinute\(\)/.test(startBlock),
    'стартът чака до кръглата минута с setTimeout, преди да пусне интервала');
ok(/if \(calBellInterval \|\| calBellAlignTimer\) return;/.test(startBlock),
    'часовникът не се пуска втори път, докато чака минутата');
ok(/calBellInterval = setInterval\(\(\) => calendarBellTick\(Date\.now\(\)\), CAL_BELL_TICK_MS\);/.test(startBlock),
    'след минутата пуска интервала на 20 сек');
ok(/CACHE_NAME = 'nomn-b5\.29'/.test(sw), 'sw.js е вдигнат на nomn-b5.29');

// --- 2. Живият път ----------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
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

    // Записва кога е поискан всеки таймер и кога наистина е гръмнал.
    window.__timers = { timeouts: [], intervals: [], fires: [] };
    const _st = window.setTimeout, _si = window.setInterval;
    window.setTimeout = function (fn, delay, ...rest) {
        const at = Date.now();
        window.__timers.timeouts.push({ delay, at });
        return _st.call(window, function () {
            window.__timers.fires.push({ kind: 'timeout', delay, at: Date.now() });
            return typeof fn === 'function' ? fn.apply(this, arguments) : fn;
        }, delay, ...rest);
    };
    window.setInterval = function (fn, delay, ...rest) {
        window.__timers.intervals.push({ delay, at: Date.now() });
        return _si.call(window, function () {
            window.__timers.fires.push({ kind: 'interval', delay, at: Date.now() });
            return typeof fn === 'function' ? fn.apply(this, arguments) : fn;
        }, delay, ...rest);
    };
});

await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
    && !!window.calendarBell, null, { timeout: 30000 }).then(() => true, () => false);
ok(ready, 'приложението се вдигна и часовникът е на линия');
if (!ready) await done(browser);

// 2) помощната функция
const math = await page.evaluate(() => {
    const f = window.calendarBell.msToRoundMinute;
    const base = Math.floor(Date.now() / 60000) * 60000;
    return {
        from7250: f(base + 7250),
        onMinute: f(base),
        from59999: f(base + 59999),
        from20000: f(base + 20000),
        clock: window.calendarBell.clock()
    };
});
ok(math.from7250 === 52750, 'от :07.250 остават 52 750 ms до кръглата минута', math.from7250);
ok(math.onMinute === 0, 'на самата минута остават 0 ms', math.onMinute);
ok(math.from59999 === 1, 'преди минутата остава 1 ms', math.from59999);
ok(math.from20000 === 40000, 'от :20 остават 40 000 ms', math.from20000);
ok(math.clock.tickMs === 20000 && math.clock.roundMs === 60000,
    'часовникът работи с 20 сек проверки и 60 сек кръгла минута', math.clock);

// 3) чака ли минутата
const sched = await page.evaluate(() => window.__timers);
const align = sched.timeouts
    .filter(t => t.delay > 0 && t.delay <= 60000 && Math.abs(t.delay - (60000 - (t.at % 60000))) <= 2)
    .pop();
ok(!!align, 'часовникът е поискал изчакване точно до следващата :00.000', { align, last: sched.timeouts.slice(-4) });
const intervalsBeforeAlign = sched.intervals.filter(i => i.delay === 20000 && (!align || i.at < align.at)).length;
ok(intervalsBeforeAlign === 0, 'преди кръглата минута няма пуснат интервал на 20 сек', { intervalsBeforeAlign, intervals: sched.intervals });

// 4-5) чакаме истинската минута и мерим кога гърми
const waitAlign = align ? Math.max(1000, align.at + align.delay - Date.now() + 1500) : 61000;
await page.waitForTimeout(Math.min(waitAlign, 63000));
const afterAlign = await page.evaluate(() => ({
    timers: window.__timers,
    clock: window.calendarBell.clock()
}));
const alignFire = (afterAlign.timers.fires || []).find(f => f.kind === 'timeout'
    && f.delay > 0 && f.delay <= 60000 && Math.abs(f.delay - (60000 - ((f.at - f.delay) % 60000))) <= 60);
ok(!!alignFire, 'първата проверка е гръмнала', { fires: (afterAlign.timers.fires || []).slice(0, 4) });
if (alignFire) {
    const sec = new Date(alignFire.at).getSeconds();
    const ms = new Date(alignFire.at).getMilliseconds();
    ok(sec === 0 && ms < 50, 'първата проверка е точно на кръглата минута (:00.000)', { at: new Date(alignFire.at).toISOString(), sec, ms });
}
ok(afterAlign.clock.ticking === true, 'след минутата часовникът вече тиктака', afterAlign.clock);
const ivs = (afterAlign.timers.intervals || []).filter(i => i.delay === 20000);
ok(ivs.length === 1, 'интервалът е пуснат веднъж, на 20 сек', ivs.length);

// 5) още една проверка: следващата пада на :20 или :40
await page.waitForTimeout(21000);
const tail = await page.evaluate(() => window.__timers.fires.filter(f => f.kind === 'interval' && f.delay === 20000));
ok(tail.length >= 1, 'след минутата има поне още една проверка', tail.length);
const bad = tail.filter(f => ![0, 20, 40].includes(new Date(f.at).getSeconds()));
ok(tail.length >= 1 && bad.length === 0, 'всяка следваща проверка е на :00, :20 или :40', tail.map(f => new Date(f.at).toISOString()));
if (tail.length >= 2) {
    const gaps = tail.slice(1).map((f, i) => f.at - tail[i].at);
    ok(gaps.every(g => Math.abs(g - 20000) <= 250), 'проверките са на равни 20 сек', gaps);
}

// 6) конзола
ok(errs.length === 0, 'без грешки в конзолата', errs);

await done(browser);
