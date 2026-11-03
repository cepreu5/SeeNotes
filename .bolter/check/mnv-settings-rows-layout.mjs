// MNV: новите настройки („Автоматична защита“ и „Заключване след“) да изглеждат като другите,
// и приложението да се обявява за приложение (иначе защитният екран не може да излезе изобщо).
//
// Собственикът, 3 Nov 2026:
//   „Не си оправил стиловете на новите настройки“ (снимка от телефон: етикетът центриран на
//    свой ред, чекбоксът отделен, огромна празнина, „Lock after“ чак долу)
//   „Защитния екран не се включва“ (в MNV)
//
// Причината за стиловете: в @media (max-width: 480px) редовете на Настройки стават колони, а
// изключението „този ред остава на един ред“ е списък с id-та; #auto-protect и #idle-lock не бяха
// в него. В колона inline flex-basis: 265px става ВИСОЧИНА на етикета — оттам празнината.
//
// Причината за защитния екран: MNV/index-2.html нямаше <link rel="manifest">, значи Android
// отваря страницата като обикновен таб, display-mode не е standalone и проверката
// privacyAppScreenMode() отрязва всички пътища до екрана.
//
// Какво проверява (истински Chromium, истинският MNV код, 390x844 / 412x915 / 480x800 / 1280x900):
//   1) всеки ред в Настройки с контрола държи етикета и контролата на един ред (центрове до 10px);
//   2) етикетът не е разпънат по височина (под 40px);
//   3) #auto-protect и #idle-lock следват същия отстъп като #hide-assistant;
//   4) чекбоксът на „Автоматична защита“ е видим (поне 12px) и на същия ред;
//   5) падащото „Заключване след“ е поне 60px, с 10/15/30/60 и по подразбиране 30;
//   6) нито един ред не излиза извън кутията на модала;
//   7) диагностичният ред съществува и показва mode/armed/auto/allow/idle/hidden/focus;
//   8) страницата обявява manifest с display: standalone (иначе защитният екран няма как да излезе);
//   9) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-settings-rows-layout.mjs   (exit 1 при провал)
// MNV_ROOT=… сочи друга папка — контролен пуск срещу MNV без поправката (проверки 1-4, 7 и 8 падат).
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

const root = path.resolve(process.env.MNV_ROOT || 'MNV');
const PAGE = process.env.MNV_PAGE || 'index-2.html';

if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
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
const ORIGIN = `http://localhost:${srv.address().port}`;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const INIT = () => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
    window.kofiWidgetOverlay = { draw() { } };
    localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('useLocalFolder', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('lang', 'en');
    localStorage.setItem('language', 'en');
};

const browser = await chromium.launch({ executablePath: CHROME });

for (const [W, H, mobile] of [[390, 844, true], [412, 915, true], [480, 800, true], [1280, 900, false]]) {
    const tag = `${W}x${H}`;
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2,
        serviceWorkers: 'block'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.add('visible');
        // Другите модали (напр. „Какво ново“) да не закриват Настройки при мерене и снимка.
        document.querySelectorAll('.modal-overlay.visible').forEach(x => {
            if (x.id !== 'settings-modal') x.classList.remove('visible');
        });
        const row = document.getElementById('idle-lock');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(1400);

    const data = await page.evaluate(() => {
        const body = document.getElementById('settings-modal-body');
        const box = document.querySelector('#settings-modal .modal-content-box');
        const rows = [...body.querySelectorAll('.zoom-control-wrapper')].map(w => {
            const label = w.querySelector('label');
            const ctrl = w.querySelector('input,select,button');
            const r = el => el ? el.getBoundingClientRect() : null;
            const lr = r(label), cr = r(ctrl), wr = r(w);
            return {
                id: w.id || '(без id)',
                dir: getComputedStyle(w).flexDirection,
                labelH: lr ? Math.round(lr.height) : null,
                labelC: lr ? Math.round(lr.y + lr.height / 2) : null,
                labelX: lr ? Math.round(lr.x) : null,
                labelRight: lr ? Math.round(lr.right) : null,
                ctrlC: cr ? Math.round(cr.y + cr.height / 2) : null,
                ctrlX: cr ? Math.round(cr.x) : null,
                ctrlW: cr ? Math.round(cr.width) : null,
                ctrlH: cr ? Math.round(cr.height) : null,
                rowRight: wr ? Math.round(wr.right) : null,
                ctrl: ctrl ? ctrl.tagName + '#' + ctrl.id : null
            };
        });
        const sel = document.getElementById('idle-lock-select');
        const dbg = document.getElementById('privacy-debug-line');
        const link = document.querySelector('link[rel="manifest"]');
        return {
            rows,
            boxRight: box ? Math.round(box.getBoundingClientRect().right) : null,
            idle: sel ? { value: sel.value, options: [...sel.options].map(o => o.value) } : null,
            debug: dbg ? { shown: getComputedStyle(dbg).display !== 'none', text: (dbg.textContent || '').trim() } : null,
            manifestHref: link ? link.getAttribute('href') : null
        };
    });

    // 1 + 2: всеки ред с контрола — етикет и контрола на един ред, етикетът не е разпънат
    for (const row of data.rows) {
        if (row.ctrlC === null || row.labelC === null) continue;
        const sameLine = Math.abs(row.ctrlC - row.labelC) <= 10;
        ok(sameLine, `[${tag}] ${row.id}: етикет и контрола на един ред`, { labelC: row.labelC, ctrlC: row.ctrlC, dir: row.dir });
        ok(row.labelH !== null && row.labelH <= 40, `[${tag}] ${row.id}: етикетът не е разпънат по височина`, { labelH: row.labelH });
    }

    // 3: новите редове следват отстъпа на „Hide Assistant“
    const ref = data.rows.find(r => r.id === 'hide-assistant');
    for (const id of ['auto-protect', 'idle-lock']) {
        const row = data.rows.find(r => r.id === id);
        ok(!!row, `[${tag}] има ред ${id}`);
        if (!row || !ref) continue;
        ok(row.labelX === ref.labelX, `[${tag}] ${id}: етикетът започва на същото място като при Hide Assistant`, { got: row.labelX, want: ref.labelX });
        ok(row.ctrlX !== null && row.ctrlX > row.labelRight && row.ctrlX - row.labelRight <= 40,
            `[${tag}] ${id}: контролата стои плътно до етикета`, { ctrlX: row.ctrlX, labelRight: row.labelRight });
    }

    // 4: чекбоксът на „Автоматична защита“ е видим
    const ap = data.rows.find(r => r.id === 'auto-protect');
    ok(ap && ap.ctrlW >= 12 && ap.ctrlH >= 12, `[${tag}] чекбоксът на Automatic protection е видим`, ap && { w: ap.ctrlW, h: ap.ctrlH });

    // 5: падащото за времето
    ok(!!data.idle, `[${tag}] има #idle-lock-select`);
    if (data.idle) {
        const w = data.rows.find(r => r.id === 'idle-lock');
        ok(w && w.ctrlW >= 60, `[${tag}] Lock after е поне 60px широко`, w && { w: w.ctrlW });
        ok(data.idle.options.join(',') === '10,15,30,60', `[${tag}] Lock after предлага 10/15/30/60`, data.idle.options);
        ok(data.idle.value === '30', `[${tag}] Lock after е 30 по подразбиране`, data.idle.value);
    }

    // 6: нищо не излиза извън модала
    for (const row of data.rows) {
        ok(data.boxRight === null || row.rowRight <= data.boxRight, `[${tag}] ${row.id}: редът не излиза извън модала`, { rowRight: row.rowRight, boxRight: data.boxRight });
    }

    // 7: диагностичният ред
    ok(data.debug && data.debug.shown, `[${tag}] диагностичният ред се вижда при debug`, data.debug);
    if (data.debug && data.debug.text) {
        const t = data.debug.text;
        ok(/mode=(app|tab)/.test(t) && /armed=[01]/.test(t) && /auto=[01]/.test(t) && /allow=[01]/.test(t)
            && /idle=\d+s/.test(t) && /hidden=[01]/.test(t) && /focus=[01?]/.test(t),
            `[${tag}] диагностичният ред показва всички проверки`, t);
    }

    // 8: manifest
    ok(data.manifestHref === 'manifest.json', `[${tag}] страницата обявява manifest.json`, data.manifestHref);
    const man = await page.evaluate(async () => {
        const l = document.querySelector('link[rel="manifest"]');
        if (!l) return null;
        try {
            const r = await fetch(l.href, { cache: 'no-store' });
            if (!r.ok) return { status: r.status };
            const j = await r.json();
            return { status: r.status, display: j.display, start: j.start_url };
        } catch (e) { return { error: String(e) }; }
    });
    ok(man && man.status === 200 && man.display === 'standalone',
        `[${tag}] manifest се зарежда и е display: standalone`, man);

    // 9: конзола
    ok(errs.length === 0, `[${tag}] без изключения в конзолата`, errs.slice(0, 3));

    // Снимка за око: махаме помощника и другите попъпи, за да се виждат редовете на Настройки.
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = '#folderIdPromptPopup, #content-modal, .guide-container, #kb-assistant-container, #kb-fab { display: none !important; }';
        document.head.appendChild(style);
        ['kb-assistant-container', 'kb-fab', 'folderIdPromptPopup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        document.querySelectorAll('.modal-overlay').forEach(x => {
            if (x.id === 'settings-modal') return;
            x.classList.remove('visible');
            x.style.display = 'none';
        });
        const row = document.getElementById('idle-lock');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `.bolter/check/mnv-settings-rows-${W}.png` });
    await ctx.close();
}

await browser.close();
srv.close();

console.log(`\n${fails === 0 ? 'OK' : 'FAILED'}: ${n - fails}/${n} проверки`);
process.exit(fails === 0 ? 0 : 1);
