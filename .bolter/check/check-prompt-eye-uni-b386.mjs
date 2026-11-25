// uni b3.86 — окото в полето за парола (същата поправка като nomn b5.71).
//
// Собственикът, 25 Nov 2026 (снимка от телефон): окото стърчеше извън полето и до него се
// виждаше ВТОРА икона (задраскано око). Причини: `hidden` не важи за <svg>, а бутонът беше
// на right:14px при поле, с 20px по-тясно от реда, и висеше над средата на полето.
//
// Тестът е по ГЕОМЕТРИЯ на реалния uni CSS: вдига попъпа за парола в състоянието, в което го
// оставя setEye() в main.js (отворено око видимо, задраскано скрито), и мери. Логиката на
// клика се проверява в nomn теста check-prompt-eye-b571.mjs, кодът е един и същ.
//
// Пускане от корена на хранилището: node .bolter/check/check-prompt-eye-uni-b386.mjs
// UNI_ROOT=… сочи друга папка (контролен пуск срещу uni без поправката).
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

const root = path.resolve(process.env.UNI_ROOT || 'uni');
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

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

const setState = (page, shown) => page.evaluate((shown) => {
    const popup = document.getElementById('folderIdPromptPopup');
    if (!popup) return false;
    popup.classList.add('show');
    if (!popup.getBoundingClientRect().width) popup.style.display = 'flex';
    const inp = document.getElementById('folderIdInput');
    const btn = document.getElementById('prompt-eye-btn');
    inp.value = 'parola123';
    // точно каквото прави showPrompt() в main.js (uni/main.js 7279): полето става block —
    // затова долният му margin се свива и редът е точно колкото полето.
    inp.style.display = 'block';
    btn.hidden = false;
    // точно каквото прави setEye() в main.js
    const off = btn.querySelector('.prompt-eye-off');
    const on = btn.querySelector('.prompt-eye-on');
    if (shown) { off.setAttribute('hidden', ''); on.removeAttribute('hidden'); }
    else { off.removeAttribute('hidden'); on.setAttribute('hidden', ''); }
    inp.type = shown ? 'text' : 'password';
    return true;
}, shown);

const measure = (page) => page.evaluate(() => {
    const R = el => {
        const b = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
            l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height,
            cy: (b.top + b.bottom) / 2, display: s.display, visibility: s.visibility
        };
    };
    const vis = el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const inp = document.getElementById('folderIdInput');
    const btn = document.getElementById('prompt-eye-btn');
    const off = btn.querySelector('.prompt-eye-off');
    const on = btn.querySelector('.prompt-eye-on');
    return {
        input: R(inp), btn: R(btn), off: R(off), on: R(on),
        offVisible: vis(off), onVisible: vis(on), inputType: inp.type
    };
});

for (const [w, h] of [[412, 915], [390, 844], [360, 800], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, locale: 'bg-BG' });
    await page.goto(`${ORIGIN}/index.html?lang=bg`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const built = await setState(page, false);
    ok(built, `${w}px: попъпът за парола е в uni`);
    const m = await measure(page);
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

    await setState(page, true);
    const s = await measure(page);
    ok(s.onVisible === true && s.offVisible === false, `${w}px: при показана парола пак е една икона`,
        { off: s.offVisible, on: s.onVisible });
    ok(s.inputType === 'text', `${w}px: при показана парола полето е type=text`, s.inputType);
    const iconInside = s.on.l >= s.btn.l - 0.5 && s.on.r <= s.btn.r + 0.5;
    ok(iconInside, `${w}px: иконата е в бутона`, {
        btn: [Math.round(s.btn.l), Math.round(s.btn.r)], icon: [Math.round(s.on.l), Math.round(s.on.r)]
    });
    if (w === 412) await page.screenshot({ path: '.bolter/check/prompt-eye-uni-b386-412.png' });
    await page.close();
}

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
