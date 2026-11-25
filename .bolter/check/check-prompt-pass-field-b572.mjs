// b5.72 / uni b3.87 — питането за парола получава СВОЕ поле, ново при всяко отваряне.
//
// Собственикът, 25 Nov 2026: „Направи питането за парола да получава свое отделно поле, създадено
// наново при всяко отваряне, за да няма какво да предлага браузърът — в nomn и в uni“ и после
// „Оправи и окото в полето в uni“.
//
// Какво проверява (истински Chromium, по ИСТИНСКИЯ път Настройки → „Нулиране“, за двата app-а):
//   1) попъпът за парола НЕ ползва общото поле — елементът е нов (маркерът от зареждането липсва);
//   2) новото поле е type=password, autocomplete=new-password, name=nm-pass-…;
//   3) окото е видимо, една икона, изцяло вътре в полето, центрирано, поне 36×36;
//   4) клик показва текста, втори клик пак маскира и пак е една икона;
//   5) след „Отказ“ общото поле се връща на мястото си (маркерът е обратно, тип текст);
//   6) две последователни отваряния дават различни name и празно поле;
//   7) попъпът за папка работи както преди: общото поле, без око, Enter връща стойността;
//   8) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/check-prompt-pass-field-b572.mjs
// APP=nomn|uni пуска само един от двата.
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

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

const serve = async (root) => {
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
    return { srv, origin: `http://localhost:${srv.address().port}` };
};

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    if (!cond) fails++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
};

const APPS = process.env.APP ? [process.env.APP] : ['nomn', 'uni'];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

const openPasswordPrompt = async (page, origin) => {
    await page.goto(`${origin}/index.html?lang=bg`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('language', 'bg'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    await page.evaluate(() => { document.getElementById('settings_button')?.click(); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { document.getElementById('lock-pass-reset-btn').click(); });
    await page.waitForTimeout(600);
};

const measure = (page) => page.evaluate(() => {
    const R = el => {
        const b = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, cy: (b.top + b.bottom) / 2 };
    };
    const visible = el => {
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const inp = document.getElementById('folderIdInput');
    const btn = document.getElementById('prompt-eye-btn');
    const off = btn ? btn.querySelector('.prompt-eye-off') : null;
    const on = btn ? btn.querySelector('.prompt-eye-on') : null;
    return {
        shared: !!inp.__nmShared,
        type: inp.type,
        autocomplete: inp.getAttribute('autocomplete'),
        name: inp.getAttribute('name'),
        value: inp.value,
        input: R(inp),
        btnHidden: btn ? btn.hidden : null,
        offVisible: visible(off),
        onVisible: visible(on),
        btn: btn ? R(btn) : null,
        off: off ? R(off) : null
    };
});

for (const app of APPS) {
    const { srv, origin } = await serve(path.resolve(app));
    console.log(`\n=== ${app} ===`);
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, locale: 'bg-BG' });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    // маркер върху ОБЩОТО поле, за да различим новия елемент от него
    await page.goto(`${origin}/index.html?lang=bg`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('language', 'bg'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    const marked = await page.evaluate(() => {
        const el = document.getElementById('folderIdInput');
        if (!el) return false;
        el.__nmShared = true;
        return true;
    });
    ok(marked, `${app}: общото поле е налично преди питането`);

    await page.evaluate(() => { document.getElementById('settings_button')?.click(); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { document.getElementById('lock-pass-reset-btn').click(); });
    await page.waitForTimeout(600);

    const m = await measure(page);
    ok(m.shared === false, `${app}: попъпът за парола ползва НОВО поле, не общото`, { shared: m.shared });
    ok(m.type === 'password', `${app}: новото поле е маскирано (type=password)`, m.type);
    ok(m.autocomplete === 'new-password', `${app}: autocomplete=new-password`, m.autocomplete);
    ok(typeof m.name === 'string' && /^nm-pass-[a-z0-9]+$/.test(m.name), `${app}: поле с произволно name`, m.name);
    ok(m.value === '', `${app}: новото поле започва празно`, m.value);
    ok(m.btnHidden === false, `${app}: окото е видимо при парола`, m.btnHidden);
    ok(m.offVisible === true && m.onVisible === false, `${app}: видима е САМО една икона (отворено око)`,
        { off: m.offVisible, on: m.onVisible });
    const inside = m.btn.l >= m.input.l - 0.5 && m.btn.r <= m.input.r + 0.5 &&
        m.btn.t >= m.input.t - 0.5 && m.btn.b <= m.input.b + 0.5;
    ok(inside, `${app}: окото е изцяло ВЪТРЕ в новото поле`, {
        input: [Math.round(m.input.l), Math.round(m.input.r), Math.round(m.input.t), Math.round(m.input.b)],
        btn: [Math.round(m.btn.l), Math.round(m.btn.r), Math.round(m.btn.t), Math.round(m.btn.b)]
    });
    ok(Math.abs(m.btn.cy - m.input.cy) <= 2, `${app}: окото е центрирано по височина`,
        { btnCy: +m.btn.cy.toFixed(1), inputCy: +m.input.cy.toFixed(1) });
    ok(m.btn.w >= 36 && m.btn.h >= 36, `${app}: окото е с площ за пръст (поне 36×36)`,
        { w: +m.btn.w.toFixed(1), h: +m.btn.h.toFixed(1) });
    const firstName = m.name;

    // клик по окото в НОВОТО поле
    await page.evaluate(() => { document.getElementById('folderIdInput').value = 'parola123'; });
    await page.evaluate(() => { document.getElementById('prompt-eye-btn').click(); });
    await page.waitForTimeout(250);
    const shown = await measure(page);
    ok(shown.type === 'text', `${app}: след клик полето показва текста`, shown.type);
    ok(shown.onVisible === true && shown.offVisible === false, `${app}: след клик е само задрасканата икона`,
        { off: shown.offVisible, on: shown.onVisible });
    await page.evaluate(() => { document.getElementById('prompt-eye-btn').click(); });
    await page.waitForTimeout(250);
    const hidden = await measure(page);
    ok(hidden.type === 'password', `${app}: втори клик пак маскира`, hidden.type);
    ok(hidden.offVisible === true && hidden.onVisible === false, `${app}: след втория клик пак една икона`,
        { off: hidden.offVisible, on: hidden.onVisible });

    // Отказ → общото поле се връща
    await page.evaluate(() => { document.getElementById('prompt-no-btn').click(); });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
        const el = document.getElementById('folderIdInput');
        return { shared: !!el.__nmShared, type: el.type, display: el.style.display, inRow: !!el.closest('.prompt-input-row') };
    });
    ok(after.shared === true, `${app}: след „Отказ“ общото поле е обратно`, after);
    ok(after.type === 'text', `${app}: общото поле пак е текст`, after.type);
    ok(after.inRow === true, `${app}: общото поле е в реда на попъпа`, after.inRow);

    // второ отваряне → ново поле с друго name
    await page.evaluate(() => { document.getElementById('lock-pass-reset-btn').click(); });
    await page.waitForTimeout(600);
    const again = await measure(page);
    ok(again.shared === false, `${app}: при второто отваряне пак е ново поле`, again.shared);
    ok(again.name !== firstName, `${app}: двете отваряния дават различни name (няма история)`,
        { first: firstName, second: again.name });
    ok(again.value === '', `${app}: второто поле също започва празно`, again.value);
    await page.evaluate(() => { document.getElementById('prompt-no-btn').click(); });
    await page.waitForTimeout(400);

    // попъпът за папка работи както преди
    const folder = await page.evaluate(async () => {
        const p = showPrompt('Име на папка:');
        await new Promise(r => setTimeout(r, 200));
        const el = document.getElementById('folderIdInput');
        const info = {
            shared: !!el.__nmShared,
            type: el.type,
            eyeHidden: document.getElementById('prompt-eye-btn').hidden
        };
        el.value = 'TestFolder';
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        info.value = await p;
        return info;
    });
    ok(folder.shared === true, `${app}: питането за папка ползва общото поле`, folder.shared);
    ok(folder.type === 'text', `${app}: питането за папка е текст`, folder.type);
    ok(folder.eyeHidden === true, `${app}: при папка няма око`, folder.eyeHidden);
    ok(folder.value === 'TestFolder', `${app}: Enter връща написаното`, folder.value);
    ok(errors.length === 0, `${app}: няма изключения в конзолата`, errors.slice(0, 3));

    if (app === 'nomn') await page.screenshot({ path: '.bolter/check/prompt-pass-field-b572.png' });
    await page.close();
    srv.close();
}

await browser.close();
console.log(`\n${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
