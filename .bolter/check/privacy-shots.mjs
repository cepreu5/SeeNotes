// Снимки на екрана за поверителност при няколко размера (за визуална проверка).
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
const CHROME = ['/opt/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome'].find(p => existsSync(p));

const root = path.resolve('uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
    try { const b = await readFile(path.join(root, rel)); res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
    catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://localhost:${srv.address().port}`;
const browser = await chromium.launch({ executablePath: CHROME });

// 390x844, 320x568 (малък телефон), 1280x900 (широк екран)
const sizes = [[390, 844, 'phone'], [320, 568, 'small'], [1280, 900, 'wide']];
for (const [w, h, name] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    await page.addInitScript(() => {
        const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
        window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
        window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
        window.kofiWidgetOverlay = { draw() { } }; window.kofiwidget2 = { init() { }, draw() { } };
        ['useGoogleDb:false', 'useLocalDb:false', 'useLocalFolder:false', 'useArhDb:false', 'updateFromSource:false', 'hideAssistant:true', 'language:bg'].forEach(kv => { const [k, v] = kv.split(':'); localStorage.setItem(k, v); });
        localStorage.setItem('useIndexedDb', 'true');
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => (/display-mode:\s*(standalone|fullscreen)/.test(String(q)))
            ? { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } }
            : orig(q);
    });
    await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `.bolter/check/privacy-${name}.png` });
    const info = await page.evaluate(() => {
        const st = document.querySelector('.privacy-stack');
        const t = [...document.querySelectorAll('.privacy-tile')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
        return { scale: st ? getComputedStyle(st).transform : null, tiles: t, vw: innerWidth, vh: innerHeight };
    });
    console.log(name, JSON.stringify(info));
    await ctx.close();
}
await browser.close();
srv.close();
