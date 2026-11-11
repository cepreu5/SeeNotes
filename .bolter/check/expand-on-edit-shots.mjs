// Снимки за око: редът „Разпъване при редактиране" в Настройки и бележка по цялата ширина при писане.
import { chromium } from '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootSrc = path.resolve(process.env.ROOT || 'nomn');
const tag = process.env.TAG || 'nomn';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
    try {
        const b = await readFile(path.join(rootSrc, rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
    const url = route.request().url();
    if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
    }
    if (url.startsWith('https://accounts.google.com/gsi/client')) {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
await ctx.addInitScript(() => {
    const files = { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); } };
    window.gapi = { load() { }, client: { setToken() { }, getToken() { return { access_token: 'tok' }; }, drive: { files } }, auth: { getToken() { return { access_token: 'tok' }; } } };
    sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
    localStorage.setItem('language', 'bg');
    localStorage.setItem('singleNoteMode', 'false');
});
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 10000 });
await page.evaluate(() => createSettingsUI([], false));
await page.evaluate(() => document.getElementById('settings_button').click());
await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).catch(() => { });
await page.waitForTimeout(1200);
const row = await page.evaluate(() => {
    const el = document.getElementById('expand-on-edit-checkbox');
    const lbl = document.querySelector('label[for="expand-on-edit-checkbox"]');
    const r = el ? el.getBoundingClientRect() : null;
    const lr = lbl ? lbl.getBoundingClientRect() : null;
    return { checked: el.checked, rowBox: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, label: lbl && lbl.textContent.trim(), labelBox: lr && { x: Math.round(lr.x), w: Math.round(lr.width) } };
});
console.log('row', JSON.stringify(row));
await page.locator('#expand-on-edit').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.locator('#expand-on-edit').screenshot({ path: `.bolter/check/expand-row-${tag}.png` });
await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));
const NOTE = { key: 'plan', id: '9501', gdid: 'SH1', raw: 'План за седмицата|понеделник: отчет|вторник: среща' };
await page.evaluate((def) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOffline = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    allNotesData.push({ alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0, gdid: def.gdid, id: def.id, notetxt: def.raw, numord: Number(def.id), sellist: 0, status: 0, text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244 });
    showModal({ raw: def.raw, format: '', id: def.id, gdid: def.gdid });
}, NOTE);
await page.waitForTimeout(800);
await page.locator('.note-window.visible #modal-body').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `.bolter/check/expand-editing-${tag}.png` });
const st = await page.evaluate(() => {
    const w = getOpenNoteWindows().find(x => x.el.classList.contains('visible'));
    const b = w.box.getBoundingClientRect();
    return { kb: w.el.classList.contains('note-window-kb-top'), wide: w.el.classList.contains('note-window-kb-wide'), w: Math.round(b.width), left: Math.round(b.left), top: Math.round(b.top), vw: innerWidth };
});
console.log('editing', JSON.stringify(st));
await browser.close();
srv.close();
