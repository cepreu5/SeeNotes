// Лендинг (uni/index.html): снимката в секцията feature2b се вижда ЦЯЛАТА, без изрязване.
// Проверява на 1280 и на 390:
//   - контейнерът #feature-multinotes .feature-image е точно колкото самата снимка
//     (ширина и височина), т.е. няма нито изрязване, нито празни ленти;
//   - отношението ширина/височина на показаното съвпада с naturalWidth/naturalHeight;
//   - снимката е със заоблени ъгли (border-radius на контейнера + overflow: hidden);
//   - няма хоризонтален скрол;
//   - останалите секции НЕ са пипнати: feature1/feature3 пазят object-fit: cover и 65vh.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/landing-feature-image.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
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

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
};

const browser = await chromium.launch();
for (const [w, h, label] of [[1280, 800, '1280'], [390, 844, '390']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const m = await page.evaluate(() => {
    const sec = document.querySelector('#feature-multinotes');
    const cont = sec.querySelector('.feature-image');
    const img = cont.querySelector('img');
    cont.scrollIntoView({ block: 'center' });
    const cr = cont.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const cs = getComputedStyle(cont), is = getComputedStyle(img);
    const others = ['#feature1', '#feature3', '#feature4'].map(sel => {
      const s = document.querySelector(sel);
      const c = s && s.querySelector('.feature-image');
      const i = c && c.querySelector('img');
      const cc = c ? getComputedStyle(c) : null;
      return {
        sel,
        fit: i ? getComputedStyle(i).objectFit : null,
        h: cc ? cc.height : null,
        radius: cc ? cc.borderRadius : null,
      };
    });
    return {
      cont: { w: cr.width, h: cr.height },
      img: { w: ir.width, h: ir.height, nw: img.naturalWidth, nh: img.naturalHeight },
      fit: is.objectFit,
      radius: cs.borderRadius,
      overflow: cs.overflow,
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      others,
    };
  });

  const tag = `[${label}]`;
  ok(m.cont.w > 0 && m.cont.h > 0, `${tag} контейнерът има размери`, m.cont);
  ok(Math.abs(m.cont.w - m.img.w) <= 1 && Math.abs(m.cont.h - m.img.h) <= 1,
    `${tag} контейнерът е точно колкото снимката (без изрязване и без ленти)`,
    { cont: m.cont, img: m.img });
  const shown = m.img.w / m.img.h, natural = m.img.nw / m.img.nh;
  ok(Math.abs(shown - natural) / natural < 0.01,
    `${tag} показаното отношение съвпада с оригинала (${shown.toFixed(3)} срещу ${natural.toFixed(3)})`, { shown, natural });
  ok(m.fit === 'contain', `${tag} object-fit: contain`, m.fit);
  ok(m.radius === '34px', `${tag} заоблени ъгли 34px на контейнера`, m.radius);
  ok(m.overflow === 'hidden', `${tag} overflow: hidden реже по заоблените ъгли`, m.overflow);
  ok(m.docW <= m.winW, `${tag} няма хоризонтален скрол`, { docW: m.docW, winW: m.winW });
  const expectH = w > 900 ? h * 0.65 : h * 0.40; // 65vh настолно / 40vh под 900px
  for (const o of m.others) {
    ok(o.fit === 'cover' && Math.abs(parseFloat(o.h) - expectH) <= 1,
      `${tag} ${o.sel} остава както преди (cover, ${w > 900 ? '65vh' : '40vh'})`, { ...o, expectH });
    ok(o.radius === '34px', `${tag} ${o.sel} пази заоблените ъгли`, o);
  }
  ok(errors.length === 0, `${tag} нула конзолни грешки`, errors);

  if (process.env.SHOTS) {
    await page.locator('#feature-multinotes').scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.locator('#feature-multinotes').screenshot({ path: `${process.env.SHOTS}/landing-multinotes-${label}.png` });
  }
  await page.close();
}
await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
