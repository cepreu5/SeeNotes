// Ko-fi иконката за подкрепа: плътен контейнер и качване над лентата с отворените бележки (b2.71).
// Собственикът (24.10.2026): „иконата на ko-fi има iframe class=floatingchat-container, която покрива
// значително по-голяма област от самото изображение. може ли да я оптимизираш и също да се измества
// от лентата нагоре".
// Проверява се с ИСТИНСКИЯ widget на Ko-fi (скриптовете и стиловете му са в fixtures/kofi/cdn и се
// сервират локално, за да не зависи тестът от мрежата) върху ИСТИНСКИЯ uni/style.css:
//   - контейнерът и iframe-ът са колкото видимия бутон (88x48, защото бутонът на Ko-fi е 87x46), не 195x65;
//   - вътре в iframe-а няма скролбар и бутонът не се реже отгоре (оплакване на собственика, 24.10.2026);
//   - логото е изцяло вътре в iframe-а и не се реже;
//   - клик извън контейнера НЕ се прихваща от widget-а (стига до елемента под него);
//   - клик/докосване върху логото отваря прозорчето на Ko-fi;
//   - при видима лента с отворени бележки иконката и прозорчето се качват над нея, а без лента
//     се връщат на мястото си;
//   - същото важи за мобилния вариант (-mobi) на 390px.
// Пуска се от корена на хранилището:
//   node .bolter/check/kofi-widget.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const fixtures = path.resolve('.bolter/check/fixtures/kofi');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };

const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // Страницата-стенд живее при фикстурите, но ползва style.css от uni/.
    if (p === '/__kofi-harness.html') {
        const b = await readFile(path.join(fixtures, 'harness.html'));
        res.writeHead(200, { 'Content-Type': 'text/html', 'cache-control': 'no-store' });
        return res.end(b);
    }
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
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 300) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch();

// Локални копия на това, което widget-ът тегли от мрежата.
async function routeExternal(ctx) {
    await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
        const url = route.request().url();
        const m = url.match(/^https:\/\/storage\.ko-fi\.com\/(.+)$/);
        if (m) {
            try {
                // Пътят след домейна (cdn/scripts/...) съвпада с този под fixtures/kofi/.
                const b = await readFile(path.join(fixtures, m[1]));
                const ct = m[1].endsWith('.css') ? 'text/css' : m[1].endsWith('.js') ? 'text/javascript' : 'image/png';
                return route.fulfill({ status: 200, contentType: ct, body: b });
            } catch { return route.fulfill({ status: 404, body: '' }); }
        }
        if (/fonts\.googleapis\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* без шрифтове */' });
        // Самото прозорче на Ko-fi (ko-fi.com/...) - празна страница, важно е дали се отвори.
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html><body>kofi</body></html>' });
    });
}

const SET_BAR = (px) => `(() => {
    document.documentElement.style.setProperty('--open-notes-bar-h', '${px}px');
    document.body.classList.toggle('open-notes-bar-visible', ${px} > 0);
})()`;

// Чака widget-ът да се появи (показва се след като стиловете му се заредят). Ko-fi държи
// контейнера с inline height:0, докато вътрешният документ не стане complete, и после маха този
// style - затова се чака и реална височина, не само наличие на iframe-а.
async function waitWidget(page, wrapSel, frameSel) {
    for (let i = 0; i < 60; i++) {
        const ready = await page.evaluate(([wrapSel, frameSel]) => {
            const w = document.querySelector(wrapSel);
            const f = document.querySelector(frameSel);
            if (!w || !f || getComputedStyle(w).display === 'none') return false;
            if (w.getBoundingClientRect().height < 20) return false;
            const d = f.contentDocument;
            const img = d && d.querySelector('.kofiimg');
            return !!(img && img.getBoundingClientRect().width > 0);
        }, [wrapSel, frameSel]);
        if (ready) { await page.waitForTimeout(200); return true; }
        await page.waitForTimeout(250);
    }
    return false;
}

async function measure(page, wrapSel, frameSel) {
    return page.evaluate(([wrapSel, frameSel]) => {
        const wrap = document.querySelector(wrapSel);
        const f = document.querySelector(frameSel);
        const r = el => el ? (b => ({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) }))(el.getBoundingClientRect()) : null;
        const d = f ? f.contentDocument : null;
        const img = d ? d.querySelector('.kofiimg') : null;
        const btn = d ? d.querySelector('.floatingchat-donate-button') : null;
        const de = d ? d.documentElement : null;
        const ir = img ? img.getBoundingClientRect() : null;
        const br = btn ? btn.getBoundingClientRect() : null;
        // Скролбарът вътре в iframe-а се вижда като scrollW/H > clientW/H.
        const body = d ? d.body : null;
        // Точка извън контейнера: какво реално ще получи клика там.
        const freePoint = wrap ? { x: wrap.getBoundingClientRect().right + 40, y: wrap.getBoundingClientRect().bottom - 20 } : null;
        const hit = freePoint ? document.elementFromPoint(freePoint.x, freePoint.y) : null;
        return {
            wrap: r(wrap), frame: r(f),
            wrapDisplay: wrap ? getComputedStyle(wrap).display : null,
            viewport: de ? { w: de.clientWidth, h: de.clientHeight } : null,
            img: ir ? { x: +ir.x.toFixed(1), y: +ir.y.toFixed(1), w: +ir.width.toFixed(1), h: +ir.height.toFixed(1) } : null,
            imgInside: !!(ir && de) ? (ir.left >= -0.5 && ir.top >= -0.5 && ir.right <= de.clientWidth + 0.5 && ir.bottom <= de.clientHeight + 0.5) : null,
            // Бутонът на Ko-fi (лого + padding) трябва да е ЦЯЛ вътре, иначе връхчето му се реже.
            btn: br ? { top: +br.top.toFixed(1), bottom: +br.bottom.toFixed(1), w: +br.width.toFixed(1), h: +br.height.toFixed(1) } : null,
            btnInside: !!(br && de) ? (br.top >= -0.5 && br.left >= -0.5 && br.bottom <= de.clientHeight + 0.5 && br.right <= de.clientWidth + 0.5) : null,
            // Няма ли място за съдържанието, браузърът слага скролбар - това е оплакването на собственика.
            noScrollbar: !!(body) ? (body.scrollWidth <= body.clientWidth + 1 && body.scrollHeight <= body.clientHeight + 1) : null,
            bodyScroll: body ? { sw: body.scrollWidth, sh: body.scrollHeight, cw: body.clientWidth, ch: body.clientHeight } : null,
            gapBottom: wrap ? +(innerHeight - wrap.getBoundingClientRect().bottom).toFixed(1) : null,
            hitOutside: hit ? (hit.tagName + (hit.id ? '#' + hit.id : '')) : null,
            viewportH: innerHeight,
        };
    }, [wrapSel, frameSel]);
}

async function popupState(page, popupSel) {
    return page.evaluate((sel) => {
        const p = document.querySelector(sel);
        if (!p) return null;
        const b = p.getBoundingClientRect();
        return { h: +b.height.toFixed(1), opacity: getComputedStyle(p).opacity, gapBottom: +(innerHeight - b.bottom).toFixed(1) };
    }, popupSel);
}

// ---------------------------------------------------------------- десктоп 1280
{
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await routeExternal(ctx);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/__kofi-harness.html`, { waitUntil: 'load' });

    const WRAP = '.floatingchat-container-wrap';
    const FRAME = 'iframe.floatingchat-container';
    const POPUP = '.floating-chat-kofi-popup-iframe';

    ok(await waitWidget(page, WRAP, FRAME), 'widget-ът на Ko-fi се появява');

    const m = await measure(page, WRAP, FRAME);
    ok(m.wrapDisplay !== 'none', 'на десктоп се вижда контейнерът .floatingchat-container-wrap', m.wrapDisplay);
    ok(m.wrap && Math.abs(m.wrap.w - 88) <= 2 && Math.abs(m.wrap.h - 48) <= 2,
        'контейнерът е колкото бутона (около 88x48), не 180x65', m.wrap);
    ok(m.frame && Math.abs(m.frame.w - 88) <= 2 && Math.abs(m.frame.h - 48) <= 2,
        'iframe-ът е колкото контейнера (около 88x48), не 195x65', m.frame);
    ok(m.frame && m.frame.w * m.frame.h <= 4600,
        'площта, която iframe-ът покрива, е под 4600 кв. px (преди беше 12675)', m.frame && m.frame.w * m.frame.h);
    ok(m.noScrollbar === true,
        'вътре в iframe-а НЯМА скролбар (съдържанието се побира)', m.bodyScroll);
    ok(m.btnInside === true,
        'бутонът на Ko-fi е изцяло вътре в iframe-а - не се реже отгоре', { btn: m.btn, viewport: m.viewport });
    ok(m.imgInside === true, 'логото на Ko-fi е изцяло вътре в iframe-а (не се реже)', { img: m.img, viewport: m.viewport });
    ok(Math.abs(m.gapBottom - 12) <= 2, 'без лента иконката стои на 12px от долу', m.gapBottom);
    ok(m.hitOutside === 'DIV#under', 'клик извън контейнера стига до елемента под него (не го прихваща widget-ът)', m.hitOutside);

    // С видима лента с отворени бележки (52px, каквато е #open-notes-bar).
    await page.evaluate(SET_BAR(52));
    await page.waitForTimeout(400);
    const mb = await measure(page, WRAP, FRAME);
    ok(mb.gapBottom >= 12 + 52 + 6, 'при видима лента иконката се качва над нея', mb.gapBottom);
    ok(mb.imgInside === true, 'логото остава цяло и след качването', { img: mb.img, viewport: mb.viewport });

    // Клик с истинска мишка върху центъра на логото отваря прозорчето.
    const clickX = m.frame.x + m.img.x + m.img.w / 2;
    const clickY = m.frame.y - 52 - 8 + m.img.y + m.img.h / 2; // рамката е преместена с лентата
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(1500);
    const pop = await popupState(page, POPUP);
    ok(pop && pop.h >= 300, 'клик върху логото отваря прозорчето на Ko-fi', pop);
    ok(pop && pop.gapBottom >= 75 + 52 - 2, 'при видима лента прозорчето също е над нея', pop && pop.gapBottom);

    // Без лента прозорчето слиза обратно.
    await page.evaluate(SET_BAR(0));
    await page.waitForTimeout(500);
    const pop2 = await popupState(page, POPUP);
    ok(pop2 && pop2.gapBottom <= 80, 'без лента прозорчето слиза на мястото си', pop2 && pop2.gapBottom);

    await ctx.close();
}

// ---------------------------------------------------------------- мобилен 390
{
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        serviceWorkers: 'block'
    });
    await routeExternal(ctx);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/__kofi-harness.html`, { waitUntil: 'load' });

    const WRAP = '.floatingchat-container-wrap-mobi';
    const FRAME = 'iframe.floatingchat-container-mobi';
    const POPUP = '.floating-chat-kofi-popup-iframe-mobi';

    ok(await waitWidget(page, WRAP, FRAME), 'мобилният widget на Ko-fi се появява на 390px');

    const m = await measure(page, WRAP, FRAME);
    ok(m.wrapDisplay !== 'none', 'на телефон се вижда .floatingchat-container-wrap-mobi', m.wrapDisplay);
    const desktopHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.floatingchat-container-wrap')).display);
    ok(desktopHidden === 'none', 'десктопният контейнер остава скрит на телефон', desktopHidden);
    ok(m.wrap && Math.abs(m.wrap.w - 88) <= 2 && Math.abs(m.wrap.h - 48) <= 2,
        'мобилният контейнер е колкото бутона (около 88x48), не 195x50', m.wrap);
    ok(m.frame && Math.abs(m.frame.w - 88) <= 2 && Math.abs(m.frame.h - 48) <= 2,
        'мобилният iframe е колкото контейнера', m.frame);
    ok(m.noScrollbar === true,
        'в мобилния iframe НЯМА скролбар (съдържанието се побира)', m.bodyScroll);
    ok(m.btnInside === true,
        'мобилният бутон на Ko-fi е изцяло вътре - не се реже отгоре', { btn: m.btn, viewport: m.viewport });
    ok(m.imgInside === true, 'логото е изцяло вътре в мобилния iframe', { img: m.img, viewport: m.viewport });
    ok(Math.abs(m.gapBottom - 12) <= 2, 'без лента иконката стои на 12px от долу', m.gapBottom);
    ok(m.hitOutside === 'DIV#under', 'клик извън контейнера стига до елемента под него', m.hitOutside);

    await page.evaluate(SET_BAR(52));
    await page.waitForTimeout(400);
    const mb = await measure(page, WRAP, FRAME);
    ok(mb.gapBottom >= 12 + 52 + 6, 'при видима лента мобилната иконка се качва над нея', mb.gapBottom);
    ok(mb.imgInside === true, 'логото остава цяло и след качването', { img: mb.img, viewport: mb.viewport });

    const tx = m.frame.x + m.img.x + m.img.w / 2;
    const ty = m.frame.y - 52 - 8 + m.img.y + m.img.h / 2;
    await page.touchscreen.tap(tx, ty);
    await page.waitForTimeout(1500);
    const pop = await popupState(page, POPUP);
    ok(pop && pop.h >= 300, 'докосване на логото отваря мобилното прозорче на Ko-fi', pop);
    ok(pop && pop.gapBottom >= 75 + 52 - 2, 'при видима лента мобилното прозорче е над нея', pop && pop.gapBottom);

    await ctx.close();
}

await browser.close();
srv.close();

console.log('----');
console.log(`${n - fails}/${n} проверки минават`);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
