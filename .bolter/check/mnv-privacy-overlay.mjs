// Защитен овърлей в MNV (порт от uni) — жив браузър (Playwright + Chromium).
// Проверява: овърлеят го няма при старт; privacyOverlayShow() го показва; стои НАД отворена бележка;
// две плочки 300x300, цели в екрана на 390x844, 844x390 и 1280x900; часовник с три стрелки; календар
// с днешния ден и максимум две точки в цвят от --note-bg-N; Затвори го скрива; клик на логото го
// показва; истински blur в режим на приложение го показва, а focus без скриване го маха.
// Пускане от корена на хранилището: node .bolter/check/mnv-privacy-overlay.mjs   (exit 1 при провал)
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
const CHROME = [
    '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome'
].find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'MNV');
const PAGE = process.env.MNV_PAGE || 'index-2.html';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
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
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.addInitScript(() => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = {
        accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 },
        oauth2
    };
    window.kofiWidgetOverlay = { draw() { } };
    localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('useLocalFolder', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('lang', 'bg');
    localStorage.setItem('language', 'bg');
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
    && typeof startApp === 'function' && typeof mediaData !== 'undefined'
    && typeof showModal === 'function', null, { timeout: 30000 }).then(() => true, () => false);
ok(booted, 'страницата на приложението се зареди (createNoteElement, startApp, mediaData, showModal)');
await page.evaluate(async () => {
    try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { /* ignore */ }
    useIndexedDb = true; useGoogleDb = false; useLocalFolder = false; useArhDb = false;
    isOffline = true;
    try { dbNoteIdTypeGloal = 'gdid'; } catch (e) { /* ignore */ }
    try { dbNoteIdTypeGlobal = 'gdid'; dbSourceGlobal = 1; } catch (e) { /* ignore */ }
    // Приложението е влязло: в проверките то стартира без Google, значи страницата за вход и
    // модалите, които тя показва, още стоят в подредбата и бутват съдържанието надолу. Скриваме ги,
    // както ги скрива и самото приложение след успешен старт.
    ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    if (typeof currentLang === 'string' && currentLang.indexOf('bg') !== 0) {
        try { await setLanguage('bg'); } catch (e) { /* ignore */ }
    }
});

const overlay = () => page.evaluate(() => {
    const el = document.getElementById('privacy-overlay');
    if (!el) return { exists: false, visible: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
        exists: true,
        visible: el.classList.contains('is-visible') && cs.display !== 'none',
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        aria: el.getAttribute('aria-hidden')
    };
});

// --- 1. При старт овърлей няма ----------------------------------------------------------------
const atBoot = await overlay();
ok(!atBoot.exists || !atBoot.visible, 'при старт защитният овърлей го няма на екрана', atBoot);
ok(await page.evaluate(() => typeof window.privacyOverlayShow === 'function' && typeof window.privacyOverlayHide === 'function'),
    'window.privacyOverlayShow и window.privacyOverlayHide са изнесени');

// --- 2. Извикването го показва ---------------------------------------------------------------
await page.evaluate(() => window.privacyOverlayShow());
await page.waitForFunction(() => {
    const el = document.getElementById('privacy-overlay');
    return !!el && el.classList.contains('is-visible');
}, null, { timeout: 4000 }).catch(() => { });
const shown = await overlay();
ok(shown.exists && shown.visible, 'privacyOverlayShow() показва овърлея', shown);
ok(shown.rect && shown.rect.w >= 1270 && shown.rect.h >= 890, 'овърлеят покрива целия екран', shown.rect);
ok(shown.aria === 'false', 'aria-hidden става false, докато овърлеят е показан', shown.aria);

// --- 3. Часовник и календар ------------------------------------------------------------------
const clock = await page.evaluate(() => {
    const c = document.querySelector('#privacy-overlay .privacy-clock');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
        w: Math.round(r.width), h: Math.round(r.height),
        hands: {
            hour: !!c.querySelector('.hand.hour'), minute: !!c.querySelector('.hand.minute'), second: !!c.querySelector('.hand.second')
        },
        marks: c.querySelectorAll('.mark').length,
        numbers: c.querySelectorAll('.number').length,
        trained: (c.querySelector('.hand.second') || {}).style ? c.querySelector('.hand.second').style.transform : ''
    };
});
ok(!!clock, 'овърлеят има часовник (.privacy-clock)');
ok(clock && clock.w > 200 && clock.h > 200, 'часовникът е с реални размери (стиловете от .note .clock важат и тук)', clock);
ok(clock && clock.hands.hour && clock.hands.minute && clock.hands.second, 'часовникът има часова, минутна и секундна стрелка', clock && clock.hands);
ok(clock && clock.marks === 8 && clock.numbers === 4, 'часовникът има 8 чертички (всички без 12/3/6/9) и 4 числа', clock && { marks: clock.marks, numbers: clock.numbers });
ok(clock && /rotate\(/.test(clock.trained), 'стрелките получават ъгъл от часовника', clock && clock.trained);

// --- 4. Календар: този месец, днес отбелязано, две точки в цвят от --note-bg-N ----------------
const injected = await page.evaluate(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const other = now.getDate() < daysInMonth ? now.getDate() + 1 : now.getDate() - 1;
    const mk = (id, day, color) => ({
        id: id, gdid: String(id), boardid: 'all', notetxt: 'Точка ' + id,
        text_span: '', title_span: '', color: color, status: 0, numord: 1,
        datemod: Date.now(), date: Date.now(),
        calendarDate: new Date(now.getFullYear(), now.getMonth(), day).toISOString()
    });
    const before = allNotesData.length;
    allNotesData.push(mk(970001, now.getDate(), 3), mk(970002, now.getDate(), 5), mk(970003, now.getDate(), 7),
        mk(970004, other, 1), mk(970005, now.getDate(), 0));
    // Скрита бележка (status === 1) не бива да дава точка.
    const hidden = mk(970006, now.getDate(), 9);
    hidden.status = 1;
    allNotesData.push(hidden);
    window.__privacyInjected = { day: now.getDate(), other: other, daysInMonth: daysInMonth, before: before };
    return window.__privacyInjected;
});
await page.evaluate(() => window.privacyOverlayShow());
await page.waitForTimeout(120);
const cal = await page.evaluate((info) => {
    const month = document.querySelector('#privacy-overlay .privacy-cal-month');
    const head = document.querySelectorAll('#privacy-overlay .privacy-cal-head span');
    const days = [...document.querySelectorAll('#privacy-overlay .privacy-cal-days .privacy-cal-day')].filter(d => !d.classList.contains('is-empty'));
    const today = document.querySelector('#privacy-overlay .privacy-cal-day.is-today');
    const todayNum = today && today.querySelector('.privacy-cal-num');
    // Цветовете: какво дава браузърът за --note-bg-3 върху същия елемент.
    const probe = (varName) => {
        const d = document.createElement('div');
        d.style.background = `var(${varName})`;
        document.body.appendChild(d);
        const c = getComputedStyle(d).backgroundColor;
        d.remove();
        return c;
    };
    const dotsFor = (day) => {
        const cell = days.find(d => (d.querySelector('.privacy-cal-num') || {}).textContent === String(day));
        if (!cell) return null;
        const dots = [...cell.querySelectorAll('.privacy-cal-dots i')];
        return { count: dots.length, colors: dots.map(i => getComputedStyle(i).backgroundColor) };
    };
    // Селекторът е за всички .privacy-cal-day, а is-empty също е такъв - броим реалните дни.
    return {
        monthText: month ? month.textContent : '',
        headCount: head.length,
        dayCount: days.length,
        todayNum: todayNum ? todayNum.textContent : '',
        todayDots: dotsFor(info.day),
        otherDots: dotsFor(info.other),
        bg3: probe('--note-bg-3'),
        bg5: probe('--note-bg-5'),
        bg1: probe('--note-bg-1')
    };
}, injected);
ok(/^\S/.test(cal.monthText) && cal.monthText.includes(String(new Date().getFullYear())), 'календарът показва текущия месец и годината', cal.monthText);
ok(cal.headCount === 7, 'редът с имената на дните е 7 клетки', cal.headCount);
ok(cal.dayCount === injected.daysInMonth, 'календарът показва всички дни на месеца', { days: cal.dayCount, expect: injected.daysInMonth });
ok(cal.todayNum === String(injected.day), 'днешният ден е отбелязан (is-today)', { todayNum: cal.todayNum, day: injected.day });
ok(cal.todayDots && cal.todayDots.count === 2, 'на ден с много бележки има точно две точки', cal.todayDots);
ok(cal.todayDots && cal.todayDots.colors[0] === cal.bg3, 'първата точка е в цвета на бележката (--note-bg-3)', { got: cal.todayDots && cal.todayDots.colors[0], want: cal.bg3 });
ok(cal.todayDots && cal.todayDots.colors[1] === cal.bg5, 'втората точка е в цвета на втората бележка (--note-bg-5)', { got: cal.todayDots && cal.todayDots.colors[1], want: cal.bg5 });
ok(cal.otherDots && cal.otherDots.count === 1 && cal.otherDots.colors[0] === cal.bg1, 'друг ден показва своята една точка в своя цвят (--note-bg-1)', cal.otherDots);

// --- 5. Плочките: 300x300 и цели в екрана на три размера -------------------------------------
const fitAt = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150); // resize → privacyFit (в приложението е веднага, тук чакаме кадъра)
    return page.evaluate(() => {
        const tiles = [...document.querySelectorAll('#privacy-overlay .privacy-tile')];
        return {
            vw: window.innerWidth, vh: window.innerHeight,
            tiles: tiles.map(t => {
                const r = t.getBoundingClientRect();
                return {
                    layoutW: t.offsetWidth, layoutH: t.offsetHeight,
                    w: Math.round(r.width), h: Math.round(r.height),
                    inside: r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1
                };
            })
        };
    });
};
for (const [w, h] of [[390, 844], [844, 390], [1280, 900]]) {
    const f = await fitAt(w, h);
    ok(f.tiles.length === 2, `на ${w}x${h} има две плочки`, f.tiles);
    ok(f.tiles.every(t => t.layoutW === 300 && t.layoutH === 300), `на ${w}x${h} плочките са 300x300`, f.tiles);
    ok(f.tiles.every(t => t.inside), `на ${w}x${h} нито една плочка не е отрязана`, f.tiles);
    ok(f.tiles.every(t => t.w > 40 && t.h > 40), `на ${w}x${h} плочките остават четимо големи (смаляване, не изчезване)`, f.tiles);
}

// --- 6. Стои НАД отворена бележка ------------------------------------------------------------
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => {
    showModal({ raw: 'Овърлей над бележка|Тялото на бележката под овърлея', format: '', color: '#FBFF86', id: 970100, gdid: '970100' });
});
const opened = await page.waitForFunction(() => typeof getOpenNoteWindows === 'function' && getOpenNoteWindows().length === 1, null, { timeout: 8000 })
    .then(() => true, () => false);
ok(opened, 'бележка се отвори в прозорец (за проверката „овърлеят е отгоре“)');
await page.evaluate(() => window.privacyOverlayShow());
await page.waitForTimeout(100);
const above = await page.evaluate(() => {
    const win = getOpenNoteWindows()[0];
    const r = (win.box || win.el).getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 12, r.top + 12], [r.right - 12, r.bottom - 12]];
    return pts.map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return { x: Math.round(x), y: Math.round(y), hit: hit ? (hit.id || hit.className || hit.tagName) : null, inOverlay: !!(hit && hit.closest && hit.closest('#privacy-overlay')) };
    });
});
ok(above.every(p => p.inOverlay), 'точките върху отворената бележка връщат овърлея, не бележката', above);
const zOrder = await page.evaluate(() => {
    const o = document.getElementById('privacy-overlay');
    const layer = document.getElementById('note-windows-layer');
    const z = el => (el ? Number(getComputedStyle(el).zIndex) || 0 : 0);
    return { overlay: z(o), layer: z(layer), bar: z(document.getElementById('open-notes-bar')) };
});
ok(zOrder.overlay > zOrder.layer && zOrder.overlay > zOrder.bar && zOrder.overlay >= 2147483000,
    'овърлеят е над слоя на прозорците и над лентата', zOrder);

// --- 7. Затвори го скрива --------------------------------------------------------------------
const closeBtn = await page.evaluate(() => {
    const b = document.querySelector('#privacy-overlay .privacy-close');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent.trim(), w: Math.round(r.width) };
});
ok(!!closeBtn && closeBtn.w > 20, 'овърлеят има бутон Затвори', closeBtn);
ok(!!closeBtn && (closeBtn.text === 'Затвори' || closeBtn.text === 'Close'), 'бутонът е на езика на приложението (Затвори при bg)', closeBtn && closeBtn.text);
if (closeBtn) {
    await page.mouse.click(closeBtn.x, closeBtn.y);
    const hidden = await page.waitForFunction(() => {
        const el = document.getElementById('privacy-overlay');
        return !el || !el.classList.contains('is-visible');
    }, null, { timeout: 3000 }).then(() => true, () => false);
    ok(hidden, 'Затвори скрива овърлея');
    ok(!(await overlay()).visible, 'след Затвори овърлеят не е на екрана');
}

// --- 8. Клик на логото го показва ------------------------------------------------------------
const logoPoint = await page.evaluate(() => {
    const logo = document.querySelector('header .header-logo');
    if (!logo) return null;
    const r = logo.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width) };
});
ok(!!logoPoint, 'логото в хедъра се вижда на 1280x900', logoPoint);
if (logoPoint) {
    await page.mouse.click(logoPoint.x, logoPoint.y);
    const shownByLogo = await page.waitForFunction(() => {
        const el = document.getElementById('privacy-overlay');
        return !!el && el.classList.contains('is-visible');
    }, null, { timeout: 3000 }).then(() => true, () => false);
    ok(shownByLogo, 'клик върху логото показва защитния овърлей');
    await page.evaluate(() => window.privacyOverlayHide());
    ok(!(await overlay()).visible, 'овърлеят се скрива преди следващата проверка');
}

// --- 9. Истински blur в режим на приложение го показва ---------------------------------------
const blurFlow = await page.evaluate(() => {
    // Само за тази проверка: '(display-mode: standalone)' отговаря true (инсталирано приложение).
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } } : real(q));
    const out = {};
    window.dispatchEvent(new Event('blur'));
    const el = document.getElementById('privacy-overlay');
    out.afterBlur = !!el && el.classList.contains('is-visible');
    // focus без истинско скриване: овърлеят се маха веднага, без бутон Затвори.
    window.dispatchEvent(new Event('focus'));
    out.afterFocus = !!document.getElementById('privacy-overlay')
        && document.getElementById('privacy-overlay').classList.contains('is-visible');
    // Извън режим на приложение blur не показва нищо.
    window.matchMedia = () => ({ matches: false, media: '', addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } });
    window.dispatchEvent(new Event('blur'));
    out.afterBlurTab = !!document.getElementById('privacy-overlay')
        && document.getElementById('privacy-overlay').classList.contains('is-visible');
    window.matchMedia = real;
    return out;
});
ok(blurFlow.afterBlur === true, 'blur в режим на приложение показва овърлея', blurFlow);
ok(blurFlow.afterFocus === false, 'focus без истинско скриване го маха веднага', blurFlow);
ok(blurFlow.afterBlurTab === false, 'в обикновен таб (без режим на приложение) blur не показва овърлей', blurFlow);

// --- 10. Истинско скриване (visibilitychange): овърлеят остава до „Затвори" -------------------
const hiddenFlow = await page.evaluate(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } } : real(q));
    // document.hidden става true, както когато приложението наистина излезе от екрана.
    const restore = () => { try { delete document.hidden; } catch (e) { /* ignore */ } };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    const vis = () => !!document.getElementById('privacy-overlay') && document.getElementById('privacy-overlay').classList.contains('is-visible');
    const out = { shownOnHidden: vis() };
    // focus след ИСТИНСКО скриване: овърлеят остава, докато не се натисне „Затвори".
    window.dispatchEvent(new Event('focus'));
    out.staysAfterFocus = vis();
    const btn = document.querySelector('#privacy-overlay .privacy-close');
    if (btn) btn.click();
    out.closedByButton = !vis();
    restore();
    window.matchMedia = real;
    return out;
});
ok(hiddenFlow.shownOnHidden === true, 'истинско скриване на страницата (visibilitychange -> hidden) показва овърлея', hiddenFlow);
ok(hiddenFlow.staysAfterFocus === true, 'след истинско скриване овърлеят остава и при focus (не изчезва сам)', hiddenFlow);
ok(hiddenFlow.closedByButton === true, 'след истинско скриване се затваря само с бутона „Затвори"', hiddenFlow);

// --- 11. Системният избор на файл не е напускане на приложението ------------------------------
const fileFlow = await page.evaluate(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } } : real(q));
    const input = document.createElement('input');
    input.type = 'file';
    input.style.position = 'fixed';
    input.style.left = '-200px';
    document.body.appendChild(input);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    const visible = !!document.getElementById('privacy-overlay') && document.getElementById('privacy-overlay').classList.contains('is-visible');
    input.remove();
    window.matchMedia = real;
    return { visible };
});
ok(fileFlow.visible === false, 'blur заради системния избор на файл НЕ вдига овърлея', fileFlow);

// --- Никакви грешки по страницата -----------------------------------------------------------
ok(errs.length === 0, 'няма грешки по страницата', errs.slice(0, 5));

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} ПРОВАЛИ` : ''));
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
