// b5.65 — редът „Парола за бележките“ в Настройки и полето за парола.
//
// Собственикът, 25 Nov 2026 (две снимки от телефон):
//   1) „Направи текста на 1 ред с бутона, изравнен вдясно като другите бутони — Парола за бележките“
//      (етикетът се чупеше на три реда, „Нулиране“ стоеше по средата на реда)
//   2) „Тук да не се показват отдолу последните въведени текстове/парола — полето да е тип password“
//      (попъпът за парола показваше подсказки от Chrome)
//
// Какво проверява (истински Chromium, истинският nomn код; 432/412/390/360/320/1280):
//   1) етикетът е на ЕДИН ред (височината му е под 26px и текстът не е отрязан);
//   2) етикетът и „Нулиране“ са на един ред при 360px и нагоре (вертикални центрове до 6px);
//   3) десният ръб на „Нулиране“ съвпада с десния ръб на „Зареждане от архив“ и „Изтрий“ (до 1px);
//   4) редът не излиза извън кутията на модала и не прелива (и при 320px се побира на един ред);
//      хоризонталният скрол на тялото се проверява само от 390px нагоре — под това има стар,
//      несвързан с този ред скрол от реда за мащаба (същият е и преди поправката);
//   6) попъпът за парола (клик на „Нулиране“) е type=password с autocomplete=new-password;
//   7) след Отказ полето се връща на type=text, а попъпът за папка пак е текст;
//   8) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/check-lock-pass-row-b565.mjs   (exit 1 при провал)
// NOMN_ROOT=… сочи друга папка — контролен пуск срещу nomn без поправката (проверки 1-4 и 6-7 падат).
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

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

for (const [w, h] of [[432, 900], [412, 915], [390, 844], [360, 800], [320, 720], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, locale: 'bg-BG' });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${ORIGIN}/index.html?lang=bg`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('language', 'bg'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById('settings_button')?.click());
    await page.waitForTimeout(800);

    const m = await page.evaluate(() => {
        const q = s => document.querySelector(s);
        const R = el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, cy: (b.top + b.bottom) / 2 }; };
        const row = q('#lock-pass-wrapper'), lab = q('#lock-pass-label'), btn = q('#lock-pass-reset-btn');
        const arh = q('#select-arh-btn'), del = q('#delete-folder-btn'), box = q('#settings-modal .modal-content-box');
        const body = q('#settings-modal-body');
        const style = getComputedStyle(lab);
        return {
            row: R(row), lab: R(lab), btn: R(btn), arh: R(arh), del: R(del), box: R(box),
            labText: lab.textContent.trim(),
            labLines: Math.round(R(lab).h / parseFloat(style.lineHeight || style.fontSize)),
            labClipped: lab.scrollWidth > lab.clientWidth + 1,
            labWs: style.whiteSpace,
            scrollX: body ? body.scrollWidth - body.clientWidth : 0,
            rowScroll: row ? row.scrollWidth - row.clientWidth : 0,
            btnText: btn.textContent.trim()
        };
    });

    ok(m.labText === 'Парола за бележките:', `${w}px: етикетът е „Парола за бележките:“`, m.labText);
    ok(m.lab.h < 26 && !m.labClipped, `${w}px: етикетът е на един ред, без отрязване`, { h: Math.round(m.lab.h), clipped: m.labClipped });
    ok(m.labWs === 'nowrap', `${w}px: етикетът е с white-space nowrap`, m.labWs);
    ok(Math.abs(m.btn.r - m.arh.r) <= 1, `${w}px: десният ръб на „Нулиране“ съвпада с „Зареждане от архив“`, { btn: Math.round(m.btn.r), arh: Math.round(m.arh.r) });
    ok(Math.abs(m.btn.r - m.del.r) <= 1, `${w}px: десният ръб на „Нулиране“ съвпада с „Изтрий“`, { btn: Math.round(m.btn.r), del: Math.round(m.del.r) });
    ok(m.btn.r <= m.box.r + 0.5 && m.lab.l >= m.box.l - 0.5, `${w}px: редът е вътре в модала`, { box: Math.round(m.box.l) + '..' + Math.round(m.box.r), row: Math.round(m.lab.l) + '..' + Math.round(m.btn.r) });
    ok(m.rowScroll <= 1, `${w}px: редът не прелива (етикетът и бутонът се побират)`, m.rowScroll);
    ok(Math.abs(m.lab.cy - m.btn.cy) <= 6, `${w}px: етикетът и бутонът са на един ред`, { labCy: Math.round(m.lab.cy), btnCy: Math.round(m.btn.cy) });
    ok(m.btn.t < m.lab.b, `${w}px: бутонът е до етикета, не отдолу`, { btnTop: Math.round(m.btn.t), labBottom: Math.round(m.lab.b) });
    if (w >= 390) ok(m.scrollX <= 1, `${w}px: няма хоризонтален скрол в тялото на Настройки`, m.scrollX);
    ok(errors.length === 0, `${w}px: няма изключения в конзолата`, errors.slice(0, 3));

    if (w === 412) await page.screenshot({ path: '.bolter/check/lock-pass-row-b565-412.png' });
    if (w === 1280) await page.screenshot({ path: '.bolter/check/lock-pass-row-b565-1280.png' });
    await page.close();
}

// --- Попъпът за парола: тип на полето ---
{
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, locale: 'bg-BG' });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${ORIGIN}/index.html?lang=bg`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('language', 'bg'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById('settings_button')?.click());
    await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('lock-pass-reset-btn').click());
    await page.waitForTimeout(500);
    const p1 = await page.evaluate(() => {
        const i = document.getElementById('folderIdInput');
        return { type: i.type, ac: i.autocomplete, shown: document.getElementById('folderIdPromptPopup').classList.contains('show'), msg: document.querySelector('#folderIdPromptPopup p').textContent.trim() };
    });
    ok(p1.type === 'password', 'попъпът за парола е type=password', p1.type);
    ok(p1.ac === 'new-password', 'autocomplete=new-password (Chrome не предлага запазени пароли)', p1.ac);
    ok(p1.shown === true, 'попъпът е отворен след „Нулиране“', p1.shown);
    // b5.66: око до полето — собственикът: „сега паролата не се вижда като пишеш“
    const e1 = await page.evaluate(() => {
        const b = document.getElementById('prompt-eye-btn');
        return { hidden: b.hidden, title: b.title, off: b.querySelector('.prompt-eye-off').hidden, on: b.querySelector('.prompt-eye-on').hidden, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) };
    });
    ok(e1.hidden === false, 'окото е видимо при парола', e1);
    ok(e1.off === false && e1.on === true, 'окото показва „покажи“ (отворено око)', e1);
    ok(e1.w >= 24 && e1.h >= 20, 'окото е с достатъчна площ за пръст', e1);
    await page.evaluate(() => document.getElementById('folderIdInput').value = 'testparola');
    await page.evaluate(() => document.getElementById('prompt-eye-btn').click());
    await page.waitForTimeout(150);
    const e2 = await page.evaluate(() => {
        const i = document.getElementById('folderIdInput');
        const b = document.getElementById('prompt-eye-btn');
        return { type: i.type, val: i.value, title: b.title, off: b.querySelector('.prompt-eye-off').hidden, on: b.querySelector('.prompt-eye-on').hidden, focused: document.activeElement === i };
    });
    ok(e2.type === 'text' && e2.val === 'testparola', 'след натискане на окото паролата се вижда', e2);
    ok(e2.off === true && e2.on === false, 'иконата сменя на задраскано око', e2);
    ok(e2.focused === true, 'фокусът остава в полето', e2.focused);
    await page.screenshot({ path: '.bolter/check/lock-pass-prompt-shown-b565.png' });
    await page.evaluate(() => document.getElementById('prompt-eye-btn').click());
    await page.waitForTimeout(150);
    const e3 = await page.evaluate(() => document.getElementById('folderIdInput').type);
    ok(e3 === 'password', 'второ натискане пак маскира', e3);
    await page.screenshot({ path: '.bolter/check/lock-pass-prompt-b565.png' });
    // Отказ: полето се връща на текст
    await page.evaluate(() => document.getElementById('prompt-no-btn').click());
    await page.waitForTimeout(400);
    const p2 = await page.evaluate(() => {
        const i = document.getElementById('folderIdInput');
        return { type: i.type, ac: i.autocomplete, shown: document.getElementById('folderIdPromptPopup').classList.contains('show') };
    });
    ok(p2.type === 'text', 'след Отказ полето пак е type=text', p2.type);
    ok(p2.shown === false, 'попъпът се затваря при Отказ', p2.shown);
    const e4 = await page.evaluate(() => document.getElementById('prompt-eye-btn').hidden);
    ok(e4 === true, 'след Отказ окото се крие', e4);
    // Другите попъпи (напр. име на папка) остават текст
    const p3 = await page.evaluate(async () => {
        const pr = showPrompt('Име на папка:');
        await new Promise(r => setTimeout(r, 200));
        const i = document.getElementById('folderIdInput');
        const res = { type: i.type, ac: i.autocomplete };
        document.getElementById('prompt-no-btn').click();
        await pr;
        return res;
    });
    ok(p3.type === 'text', 'попъпът за папка остава type=text', p3.type);
    ok(errors.length === 0, 'няма изключения в конзолата (попъпи)', errors.slice(0, 3));
    await page.close();
}

await browser.close();
srv.close();
console.log(fails ? `FAILED ${fails}/${n}` : `PASSED ${n}/${n}`);
process.exit(fails ? 1 : 0);
