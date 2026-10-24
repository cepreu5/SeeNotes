// Снимки на лентата с отворените бележки в ЦВЕТОВЕТЕ НА БЕЛЕЖКИТЕ (b2.71).
// Собственикът (24.10.2026): „цветовете на бутоните в лентата трябва да отговарят точно на цветовете
// на бележките и активната да е по-ясно и изцяло оградена с жълт контур 2px".
// Пуска се от корена на хранилището:
//   node .bolter/check/open-notes-bar-colors-shots.mjs
// Записва .bolter/check/open-notes-bar-colors-390.png и -1280.png: долната част на екрана с лентата,
// четири бележки в различни цветове, активната с жълт контур.
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
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
const PORT = srv.address().port;

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    if (url.startsWith('https://accounts.google.com/gsi/client')) {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
await ctx.addInitScript(() => {
    window.gapi = {
        load() { },
        client: {
            setToken() { }, getToken() { return { access_token: 'tok' }; },
            drive: { files: { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: {} }); } } },
        },
        auth: { getToken() { return { access_token: 'tok' }; } },
    };
    sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
    localStorage.setItem('language', 'bg');
    localStorage.setItem('gdrive_folder_id_Images', 'FOLDER_IMAGES');
    localStorage.setItem('gdrive_multinotes_data_id', 'FOLDER_DATA');
    localStorage.setItem('singleNoteMode', 'false');
});

const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });

// Четири бележки в различни цветове: цвета на бележката по подразбиране, два от палитрата и един
// тъмен потребителски цвят (на него буквите трябва да са бели).
const NOTES = [
    { gdid: 'COL1', id: '9201', raw: 'Купи хляб\nи мляко', color: undefined },
    { gdid: 'COL2', id: '9202', raw: 'План за седмицата\nпонеделник: отчет', color: '#FF829E' },
    { gdid: 'COL3', id: '9203', raw: 'Обади се на Иван', color: '#69B7FF' },
    { gdid: 'COL4', id: '9204', raw: 'Тъмна бележка', color: '#222222' },
];
for (const def of NOTES) {
    await page.evaluate((def) => {
        useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
        dbSourceGlobal = null; dirHandle = null; isOffline = false;
        authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
        allNotesData.push({
            alarm_type: -1, calendarDate: 0, color: def.color || 0, date: Date.now(), datemod: Date.now(), eventId: 0,
            gdid: def.gdid, id: def.id, notetxt: def.raw, numord: Number(def.id), sellist: 0, status: 0,
            text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
        });
        const opts = { raw: def.raw, format: '', id: def.id, gdid: def.gdid };
        if (def.color) opts.color = def.color;
        showModal(opts);
    }, def);
}
// Активна е втората (розовата) плочка - жълтият контур се вижда най-ясно върху цвят, различен от жълто.
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(1).click();
// Чака се контурът да ДОСТИГНЕ жълтото (има кратък преход), вместо да се спи.
await page.waitForFunction(() => {
    const t = document.querySelector('#open-notes-bar .open-notes-bar-tile.is-active');
    return !!t && /255, 212, 0/.test(getComputedStyle(t, '::after').boxShadow);
}, null, { timeout: 3000 });

const shots = [
    { width: 390, height: 800, file: '.bolter/check/open-notes-bar-colors-390.png' },
    { width: 1280, height: 900, file: '.bolter/check/open-notes-bar-colors-1280.png' },
];
for (const shot of shots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    // Два кадъра: подредбата след смяната на размера е приложена.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForFunction(() => {
        const t = document.querySelector('#open-notes-bar .open-notes-bar-tile.is-active');
        return !!t && /255, 212, 0/.test(getComputedStyle(t, '::after').boxShadow);
    }, null, { timeout: 3000 });
    // Долната част на екрана: лентата и плочките в едър план, с малко контекст над нея.
    await page.screenshot({
        path: shot.file,
        clip: { x: 0, y: shot.height - 170, width: shot.width, height: 170 },
    });
    console.log(`${shot.file} - ${shot.width}px`);
}
// Какво реално се вижда: фонът на всяка плочка срещу фона на нейния прозорец.
const state = await page.evaluate(() => [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')].map(t => {
    const win = openNotesBarWindowFor(t);
    const box = win && win.el.querySelector('.modal-content-box');
    const letters = t.querySelector('.open-notes-bar-letters');
    return {
        tile: getComputedStyle(t).backgroundColor,
        note: box ? getComputedStyle(box).backgroundColor : null,
        text: letters ? getComputedStyle(letters).color : null,
        active: t.classList.contains('is-active'),
        ring: getComputedStyle(t, '::after').boxShadow,
    };
}));
console.log(JSON.stringify(state, null, 1));
await browser.close();
srv.close();
