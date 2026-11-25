// b5.71 — окото в полето за парола (попъпът „Парола за заключените бележки:“).
//
// Собственикът, 25 Nov 2026 (снимка от телефон): окото стърчеше извън полето, а до него се
// виждаше ВТОРА икона (задраскано око) — двете икони се рисуваха една до друга.
// Причини: `hidden` не важи за <svg> (задрасканото око не се скриваше), бутонът беше на
// right:14px при поле, с 20px по-тясно от реда (стърчеше 6px навън), и с top:0/bottom:20px
// висеше 10px над средата на полето.
//
// Какво проверява (истински Chromium, истинският nomn код; 412/390/360/320/1280):
//   1) видима е САМО една икона (отворено око) — задрасканото е с display:none;
//   2) бутонът е ИЗЦЯЛО вътре в полето (ляво/дясно/горе/долу в рамките на полето);
//   3) центърът на бутона съвпада с центъра на полето по височина (до 2px);
//   4) площта за пръст е поне 36×36;
//   5) клик показва текста: type=text, видима е само задрасканата икона, текстът се вижда;
//   6) втори клик връща маскираното поле;
//   7) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/check-prompt-eye-b571.mjs   (exit 1 при провал)
// NOMN_ROOT=… сочи друга папка — контролен пуск срещу nomn без поправката (проверки 1, 2 и 3 падат).
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

const root = path.resolve(process.env.NOMN_ROOT || 'nomn');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
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
    if (!cond) fails++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
};

const openPasswordPrompt = async (page) => {
    await page.goto(`${ORIGIN}/index.html?lang=bg`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('language', 'bg'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById('settings_button')?.click());
    await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('lock-pass-reset-btn').click());
    await page.waitForTimeout(600);
};

const measure = (page) => page.evaluate(() => {
    const R = el => {
        const b = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
            l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height,
            cy: (b.top + b.bottom) / 2, cx: (b.left + b.right) / 2,
            display: s.display, visibility: s.visibility
        };
    };
    const inp = document.getElementById('folderIdInput');
    const btn = document.getElementById('prompt-eye-btn');
    const off = btn.querySelector('.prompt-eye-off');
    const on = btn.querySelector('.prompt-eye-on');
    const visible = el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    return {
        input: R(inp), btn: R(btn), off: R(off), on: R(on),
        offVisible: visible(off), onVisible: visible(on),
        inputType: inp.type,
        btnHidden: btn.hidden,
        value: inp.value
    };
});

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

for (const [w, h] of [[412, 915], [390, 844], [360, 800], [320, 720], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, locale: 'bg-BG' });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await openPasswordPrompt(page);
    const m = await measure(page);

    ok(m.btnHidden === false, `${w}px: окото е видимо при парола`, m.btnHidden);
    ok(m.offVisible === true && m.onVisible === false, `${w}px: видима е само едната икона (отворено око)`,
        { off: m.offVisible, on: m.onVisible });
    const inside = m.btn.l >= m.input.l - 0.5 && m.btn.r <= m.input.r + 0.5 &&
        m.btn.t >= m.input.t - 0.5 && m.btn.b <= m.input.b + 0.5;
    ok(inside, `${w}px: окото е изцяло ВЪТРЕ в полето`, {
        input: [Math.round(m.input.l), Math.round(m.input.r), Math.round(m.input.t), Math.round(m.input.b)],
        btn: [Math.round(m.btn.l), Math.round(m.btn.r), Math.round(m.btn.t), Math.round(m.btn.b)]
    });
    ok(Math.abs(m.btn.cy - m.input.cy) <= 2, `${w}px: окото е центрирано по височина в полето`,
        { btnCy: +m.btn.cy.toFixed(1), inputCy: +m.input.cy.toFixed(1) });
    ok(m.btn.w >= 36 && m.btn.h >= 36, `${w}px: окото е с площ за пръст (поне 36×36)`,
        { w: +m.btn.w.toFixed(1), h: +m.btn.h.toFixed(1) });
    // иконата не излиза от бутона
    const iconInside = m.off.l >= m.btn.l - 0.5 && m.off.r <= m.btn.r + 0.5 &&
        m.off.t >= m.btn.t - 0.5 && m.off.b <= m.btn.b + 0.5;
    ok(iconInside, `${w}px: иконата е в бутона`, {
        btn: [Math.round(m.btn.l), Math.round(m.btn.r)], icon: [Math.round(m.off.l), Math.round(m.off.r)]
    });

    // клик: показва текста и сменя иконите
    await page.evaluate(() => document.getElementById('folderIdInput').value = 'parola123');
    await page.evaluate(() => document.getElementById('prompt-eye-btn').click());
    await page.waitForTimeout(200);
    const shown = await measure(page);
    ok(shown.inputType === 'text', `${w}px: след клик полето показва текста (type=text)`, shown.inputType);
    ok(shown.onVisible === true && shown.offVisible === false, `${w}px: след клик е видима само задрасканата икона`,
        { off: shown.offVisible, on: shown.onVisible });
    await page.evaluate(() => document.getElementById('prompt-eye-btn').click());
    await page.waitForTimeout(200);
    const hidden = await measure(page);
    ok(hidden.inputType === 'password', `${w}px: втори клик пак маскира полето`, hidden.inputType);
    ok(hidden.offVisible === true && hidden.onVisible === false, `${w}px: след втория клик пак една икона`,
        { off: hidden.offVisible, on: hidden.onVisible });
    ok(errors.length === 0, `${w}px: няма изключения в конзолата`, errors.slice(0, 3));

    if (w === 412) await page.screenshot({ path: '.bolter/check/prompt-eye-b571-412.png' });
    await page.close();
}

// --- попъпът за папка НЕ показва око ---
{
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, locale: 'bg-BG' });
    await page.goto(`${ORIGIN}/index.html?lang=bg`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('language', 'bg'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    const m = await page.evaluate(() => {
        const btn = document.getElementById('prompt-eye-btn');
        return { hidden: btn.hidden, display: getComputedStyle(btn).display };
    });
    ok(m.hidden === true && m.display === 'none', 'обикновеният попъп за папка не показва око', m);
    await page.close();
}

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
