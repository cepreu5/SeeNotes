// Как ИЗГЛЕЖДА X-ът на плочката - по самите пиксели на снимката, не по CSS.
// Проверява, че кръгчето е бяло, X-ът е червен върху него, че е в горния десен ъгъл на плочката и че
// не закрива снимката; снима при 390 и при 1280 (файловете остават за око).
// Пускане: node .bolter/check/attach-delete-x-look.mjs [изходна-папка]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { decodePng } from './png-pixels.mjs';

const PLAYWRIGHT = ['/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs', 'playwright']
    .find(p => p === 'playwright' || existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = ['/opt/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome']
    .find(p => existsSync(p));
const out = path.resolve(process.argv[2] || '.bolter/check');
mkdirSync(out, { recursive: true });

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const root = path.resolve('uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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
const GSI = 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};';
// Снимката на плочката: плътен тъмнозелен квадрат - върху него бялото кръгче и червеният X се
// виждат най-ясно.
const THUMB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#1f6b3a"/></svg>';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 780 : 900 }, serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => {
        const url = route.request().url();
        if (url.startsWith('https://thumb.invalid/')) {
            return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: THUMB_SVG });
        }
        // Миниатюрата идва като подписан адрес от Drive: без него плочката пада на икона и
        // „has-photo" изчезва, а X-ът трябва да се провери именно върху снимка.
        if (/fields=thumbnailLink/.test(url)) {
            return route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ thumbnailLink: 'https://thumb.invalid/thumb=s220' })
            });
        }
        if (/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\?/.test(url)) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' });
        }
        return route.fulfill({
            status: 200, contentType: 'application/javascript',
            body: url.startsWith('https://accounts.google.com/gsi/client') ? GSI : ''
        });
    });
    const page = await ctx.newPage();
    await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
        r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* off */' }));
    await page.addInitScript(() => sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 })));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof showModal === 'function' && typeof buildAttachmentTile === 'function', null, { timeout: 25000 });
    await page.evaluate(() => {
        contentModal = document.getElementById('content-modal');
        modalBody = document.getElementById('modal-body');
        localStorage.setItem('lang', currentLang || 'bg');
        useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false; dirHandle = null; isOffline = false;
        deleteGDriveFile = async () => true;
        mediaData.length = 0;
        mediaData.push(
            { gdid: '1m0000000001', id: 1, noteid: 'G1', path: 'Wallet.jpg', pathGD: '1f0000000001', type: 1 },
            { gdid: '1m0000000002', id: 2, noteid: 'G1', path: 'Винетка 2026-27.pdf', pathGD: '1f0000000002', type: 3 },
            { gdid: '1m0000000003', id: 3, noteid: 'G1', path: 'Запис.mp3', pathGD: '1f0000000003', type: 2 },
            { gdid: '1m0000000004', id: 4, noteid: 'G1', path: 'Клип.mp4', pathGD: '1f0000000004', type: 4 },
            { gdid: '1m0000000005', id: 5, noteid: 'G1', path: '42.7|23.3|Етикет', type: 5 }
        );
        showModal({ raw: 'Бележка с прикачени файлове|Тук има снимка и още текст край', format: null, id: 'N1', gdid: 'G1' });
    });
    // Плочката на снимката се чака да зареди миниатюрата си - тогава X-ът стои върху СНИМКАТА.
    // Състоянието на плочката е на САМАТА плочка (dataset.state / класовете), не на снимката в нея.
    await page.waitForFunction(() => {
        const tiles = [...document.querySelectorAll('#modal-body .nm-attach-tile')];
        if (tiles.length !== 5) return false;
        const tile = tiles.find(t => t.classList.contains('has-photo'));
        return !!tile && tile.dataset.state === 'ready' && !!tile.querySelector('.nm-attach-tile-photo img');
    }, null, { timeout: 15000 });
    const stripEl = await page.$('#modal-body .nm-attach-strip');
    await stripEl.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
        const photo = document.querySelector('#modal-body .nm-attach-tile .nm-attach-tile-photo img');
        return photo && photo.complete && photo.naturalWidth > 0;
    }, null, { timeout: 15000 }).catch(() => {});
    const stripBox = await stripEl.boundingBox();
    const clip = { x: stripBox.x - 4, y: stripBox.y - 4, width: stripBox.width + 8, height: stripBox.height + 8 };
    const file = path.join(out, `attach-delete-x-${width}.png`);
    await page.screenshot({ path: file, clip });

    const geo = await page.evaluate(() => {
        const tile = document.querySelector('#modal-body .nm-attach-tile.has-photo');
        const badge = tile.querySelector('.nm-attach-del');
        const photoImg = tile.querySelector('.nm-attach-tile-photo img');
        const tr = tile.getBoundingClientRect(), br = badge.getBoundingClientRect();
        return {
            tile: { x: tr.x, y: tr.y, w: tr.width, h: tr.height },
            badge: { x: br.x, y: br.y, w: br.width, h: br.height },
            photoReady: !!(photoImg && photoImg.complete && photoImg.naturalWidth > 0),
            dpr: window.devicePixelRatio
        };
    });
    const png = decodePng(await readFile(file));
    // Координатите в снимката започват от clip.x/clip.y, а пикселите са с dpr пъти повече.
    const dpr = geo.dpr;
    const px = (x, y) => png.at(Math.round((x - clip.x) * dpr), Math.round((y - clip.y) * dpr));
    const cx = geo.badge.x + geo.badge.w / 2;
    const cy = geo.badge.y + geo.badge.h / 2;
    const inBadge = (dx, dy) => px(cx + dx, cy + dy);
    // Проби: средата на белия пръстен (между кръга и диагонала), центърът (диагонал), снимката.
    const white = [inBadge(-4.5, 0), inBadge(0, -4.5), inBadge(4.5, 0), inBadge(0, 4.5)];
    const centre = inBadge(0, 0);
    const photo = px(geo.tile.x + 6, geo.tile.y + geo.tile.h - 6);
    const nearX = px(geo.badge.x - 2, geo.tile.y + 4);
    const luminance = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const reddish = c => c[0] > 140 && c[0] - c[1] > 60 && c[0] - c[2] > 60;
    const greenish = c => c[1] > 60 && c[1] - c[0] > 20 && c[1] - c[2] > 20;

    ok(geo.photoReady, `(${width}) снимката на плочката е заредена - X-ът стои върху нея`, geo);
    ok(!!png && png.width > 0, `(${width}) снимката на екрана се прочете (${png.width}x${png.height})`);
    ok(white.filter(c => luminance(c) > 225).length >= 3,
        `(${width}) кръгчето на X-а е БЯЛО - вижда се и върху снимка`, white);
    ok(reddish(centre), `(${width}) самият X е червен в центъра на кръгчето`, centre);
    ok(greenish(photo), `(${width}) под X-а плочката си остава снимката (X не я закрива цялата)`, photo);
    ok(greenish(nearX) || luminance(nearX) > 225, `(${width}) вляво от кръгчето е пак снимката`, nearX);
    ok(Math.abs((geo.tile.x + geo.tile.w) - (geo.badge.x + geo.badge.w)) <= 1,
        `(${width}) X-ът е долепен за десния ръб на плочката`, {
            tileRight: geo.tile.x + geo.tile.w, badgeRight: geo.badge.x + geo.badge.w
        });
    ok(geo.badge.y - geo.tile.y <= 1, `(${width}) X-ът е в ГОРНИЯ ъгъл на плочката`,
        { tileTop: geo.tile.y, badgeTop: geo.badge.y });
    ok(geo.badge.w >= 18 && geo.badge.w <= 24, `(${width}) X-ът е ~20px, не по-малко (за пръст)`, geo.badge);
    console.log(`     снимка: ${file}`);
    await ctx.close();
}
await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минаха${fails ? `, ${fails} ПАДНАХА` : ''}`);
process.exit(fails ? 1 : 0);
