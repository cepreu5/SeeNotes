// Редът на бутоните в хедъра на MNV: Refresh е ВТОРИ, до „Режим" — жив браузър (Playwright).
// Собственикът: „Премести Refresh бутона да е до Режим (да е втори, а не 4-ти)".
//  1) в MNV/index-2.html id-тата на бутоните в #header-buttons, в DOM ред (без коментирания
//     feedback бутон и без div-а #note-counter), са mode, reload, calendar, settings, signout;
//  2) в браузъра #reload_button е ВТОРИЯТ button.header-btn в #header-buttons;
//  3) командата /rel още цъка точно този бутон (прихващаме клика в capture на window, за да не
//     стигне до mainLogic, което презарежда страницата);
//  4) при 390x844 и при 1280x900 хедърът показва всичките пет бутона, нито един не излиза извън
//     екрана, няма хоризонтален скрол и бутоните не се застъпват. Хедърът е на три реда на телефон
//     и има отделно правило за легнал телефон - затова НЕ се проверява, че всичко е на един ред.
// Пускане от корена на хранилището: node .bolter/check/mnv-header-button-order.mjs   (exit 1 при провал)
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
const EXPECTED = ['mode_button', 'reload_button', 'calendar_button', 'settings_button', 'signout_button'];

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

// --- 1) Разметката: редът в #header-buttons ------------------------------------------------
{
    const html = await readFile(path.join(root, PAGE), 'utf8');
    const start = html.indexOf('<div id="header-buttons">');
    const end = start < 0 ? -1 : html.indexOf('</header>', start);
    const slice = start < 0 ? '' : html.slice(start, end).replace(/<!--[\s\S]*?-->/g, ''); // без коментираното
    const ids = [...slice.matchAll(/<(?:button|a)\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
    ok(start >= 0 && end > start, 'в разметката има #header-buttons');
    ok(JSON.stringify(ids) === JSON.stringify(EXPECTED),
        `${PAGE}: бутоните са ${EXPECTED.join(', ')}`, ids);
}

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

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await ctx.addInitScript(() => {
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
    localStorage.setItem('showWeeklyCalendar', 'false');
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300));
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
    && typeof startApp === 'function' && typeof showModal === 'function'
    && !!document.getElementById('reload_button'), null, { timeout: 30000 }).then(() => true, () => false);
ok(booted, 'страницата на приложението се зареди и #reload_button го има');
if (!booted) {
    console.log(`\n${n - fails}/${n} проверки минаха, ${fails || 1} ПРОВАЛИ`);
    await browser.close();
    srv.close();
    process.exit(1);
}
// Страницата за вход и модалите, които тя показва, стоят в подредбата и бутват съдържанието надолу.
await page.evaluate(() => {
    ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
});

// --- 2) Живият DOM и подредбата на двата размера -------------------------------------------
const measure = (p) => p.evaluate(() => {
    const cont = document.getElementById('header-buttons');
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const btns = [...cont.querySelectorAll('button.header-btn')];
    const header = document.querySelector('header');
    return {
        ids: btns.map(b => b.id),
        vw: window.innerWidth, vh: window.innerHeight,
        headerVisible: !!header && getComputedStyle(header).display !== 'none' && header.getBoundingClientRect().height > 4,
        contRect: rect(cont),
        contOverflow: cont.scrollWidth - cont.clientWidth,
        docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        btns: btns.map(b => {
            const cs = getComputedStyle(b);
            return {
                id: b.id, box: rect(b),
                shown: cs.display !== 'none' && cs.visibility !== 'hidden' && (parseFloat(cs.opacity) || 1) > 0.05
            };
        })
    };
});

const overlaps = (bs) => {
    const bad = [];
    for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
            const a = bs[i].box, b = bs[j].box;
            const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (w > 0.5 && h > 0.5) bad.push({ pair: bs[i].id + '/' + bs[j].id, w: +w.toFixed(1), h: +h.toFixed(1) });
        }
    }
    return bad;
};

const checkLayout = (label, m) => {
    ok(m.headerVisible, `${label}: хедърът се вижда`);
    ok(JSON.stringify(m.ids) === JSON.stringify(EXPECTED), `${label}: #header-buttons държи ${EXPECTED.join(', ')}`, m.ids);
    ok(m.ids[1] === 'reload_button', `${label}: #reload_button е вторият button.header-btn`, m.ids);
    ok(m.btns.length === 5 && m.btns.every(b => b.shown && b.box.w > 8 && b.box.h > 8),
        `${label}: всичките пет бутона се виждат с ненулева кутия`, m.btns.map(b => ({ id: b.id, shown: b.shown, box: b.box })));
    const outside = m.btns.filter(b => b.box.x < -1 || b.box.x + b.box.w > m.vw + 1);
    ok(outside.length === 0, `${label}: нито един бутон не излиза извън екрана (${m.vw}px)`, outside);
    ok(m.docOverflow <= 1, `${label}: страницата няма хоризонтален скрол (scrollWidth ${m.docOverflow}px над прозореца)`, { docOverflow: m.docOverflow, vw: m.vw });
    ok(m.contOverflow <= 1, `${label}: самият #header-buttons не прелива по хоризонтала`, m.contOverflow);
    const bad = overlaps(m.btns);
    ok(bad.length === 0, `${label}: бутоните не се застъпват`, bad);
};

const at1280 = await measure(page);
checkLayout('1280x900', at1280);

// --- 3) Командата /rel още цъка точно този бутон -------------------------------------------
// Кликът се прихваща в capture върху window, преди да стигне до бутона: иначе mainLogic
// (слушателят на самия бутон) би презаредил страницата и проверката нямаше как да види нищо.
const relRes = await page.evaluate(async () => {
    const out = { hits: [], threw: null, hasHandler: typeof handleSearchCommand === 'function' };
    const spy = (e) => { out.hits.push(e.target && e.target.id ? e.target.id : (e.target && e.target.tagName)); e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', spy, true);
    try {
        if (out.hasHandler) await handleSearchCommand('/rel');
        else out.threw = 'няма handleSearchCommand';
    } catch (e) {
        out.threw = String((e && e.message) || e).slice(0, 200);
    }
    window.removeEventListener('click', spy, true);
    return out;
});
ok(relRes.hasHandler && !relRes.threw, 'командата /rel мина без грешка', relRes);
ok(relRes.hits.length === 1 && relRes.hits[0] === 'reload_button',
    'командата /rel цъка точно #reload_button', relRes);

// --- 4) Същото на телефонен размер ---------------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForFunction(() => window.innerWidth === 390, null, { timeout: 5000 }).catch(() => { });
const at390 = await measure(page);
checkLayout('390x844', at390);

await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForFunction(() => window.innerWidth === 1280, null, { timeout: 5000 }).catch(() => { });
const back1280 = await measure(page);
checkLayout('обратно на 1280x900', back1280);

ok(errs.length === 0, 'няма грешки по страницата', errs.slice(0, 5));

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} ПРОВАЛИ` : ''));
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
