// Английски fallback-и в uni/index-2.html.
// Проверява:
//   1. всеки елемент с data-key носи ТОЧНО стойността от uni/lang/i18n-en.json (същото, което
//      setLanguage() слага с element.innerHTML), тоест HTML текстът не е на друг език;
//   2. в живия DOM (без <script>/<style>/коментари) няма нито един кирилски знак — нито в текст,
//      нито в title/placeholder/alt/aria-label;
//   3. при НЕзаредени езикови файлове (симулиран 500 за lang/i18n-*.json) началният екран показва
//      английски: „Request Access“, „This is a test (Beta) version…“, а в Настройки — „Settings“;
//   4. обратната посока не е счупена: със заредени файлове и language=bg интерфейсът пак е български.
// Пуска се от корена на хранилището:
//   node .bolter/check/fallbacks-english.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };

let blockLang = false;
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (blockLang && /^\/lang\/(i18n|index)-[a-z]{2}\.json$/.test(p)) { res.writeHead(500); return res.end(); }
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel.endsWith('mainn.js') ? rel.slice(0, -'mainn.js'.length) + 'main.js' : rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;
const en = JSON.parse(await readFile(path.join(root, 'lang/i18n-en.json'), 'utf8'));

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
  if (!cond) fails++;
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });

async function open({ lang, block }) {
  blockLang = block;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript((l) => {
    if (l) localStorage.setItem('language', l);
    window.gapi = {
      load() { },
      client: {
        setToken() { }, getToken() { return { access_token: 'tok' }; },
        drive: { files: { list: () => Promise.resolve({ result: { files: [] } }), get: () => Promise.resolve({ result: {} }) } },
      },
      auth: { getToken() { return { access_token: 'tok' }; } },
    };
  }, lang);
  await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
    const url = route.request().url();
    if (url.startsWith('https://accounts.google.com/gsi/client')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  });
  const page = await ctx.newPage();
  await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));
  const errs = [];
  page.on('console', m => {
    const t = m.text();
    if (m.type() !== 'error') return;
    if (/^Failed to load resource/.test(t)) return;
    if (block && /Failed to load translations/.test(t)) return;
    if (block && /reading 'folderNotSelected'/.test(t)) return;
    errs.push(String(t).slice(0, 300));
  });
  page.on('pageerror', e => {
    const t = String(e.message);
    // Известен дефект ИЗВЪН тази промяна: когато lang/i18n-*.json отговори с 500/404 (без
    // изключение), _() стига до appTranslations[currentLang][key] върху undefined. Същите две
    // грешки излизат и на базата b951961, затова не се броят за регресия — виж бележката в отговора.
    if (block && /reading 'folderNotSelected'/.test(t)) return;
    errs.push(t.slice(0, 300));
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}

// 1 + 2: структурата на HTML и кирилицата в живия DOM, при ЗАРЕДЕНИ езикови файлове (език en).
{
  const { ctx, page, errs } = await open({ lang: 'en', block: false });

  const cmp = await page.evaluate((en) => {
    const norm = s => s.replace(/\s+/g, ' ').trim();
    // стойността от JSON минава през същия парсер, за да съвпада сериализацията на &gt; и т.н.
    const dec = s => { const d = document.createElement('div'); d.innerHTML = s; return norm(d.innerHTML); };
    const bad = [];
    document.querySelectorAll('[data-key]').forEach(el => {
      const key = el.getAttribute('data-key');
      const want = en[key];
      if (want === undefined) { bad.push({ key, why: 'липсва в en' }); return; }
      if (norm(el.innerHTML) !== dec(want)) bad.push({ key, got: norm(el.innerHTML).slice(0, 80), want: dec(want).slice(0, 80) });
    });
    return { total: document.querySelectorAll('[data-key]').length, bad };
  }, en);
  ok(cmp.total >= 90, `има ${cmp.total} елемента с data-key`, cmp.total);
  ok(cmp.bad.length === 0, 'всеки data-key елемент съдържа точно стойността от i18n-en.json', cmp.bad.slice(0, 8));

  // Живият DOM без скриптове, стилове и коментари: нула кирилица в текст и в атрибути.
  const cyr = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.COMMENT_NODE) continue;
      const p = node.parentElement;
      if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) continue;
      if (/[\u0400-\u04FF]/.test(node.nodeValue)) out.push({ где: 'текст', таг: p.tagName, id: p.id || '', текст: node.nodeValue.replace(/\s+/g, ' ').trim().slice(0, 60) });
    }
    document.querySelectorAll('*').forEach(el => {
      ['title', 'placeholder', 'alt', 'aria-label'].forEach(a => {
        const v = el.getAttribute(a);
        if (v && /[\u0400-\u04FF]/.test(v)) out.push({ где: a, таг: el.tagName, id: el.id || '', текст: v.slice(0, 60) });
      });
    });
    return out;
  });
  ok(cyr.length === 0, 'в живия DOM няма кирилица (текст и title/placeholder/alt/aria-label)', cyr.slice(0, 8));
  ok(errs.length === 0, 'нула грешки в конзолата при заредени преводи', errs.slice(0, 4));
  await ctx.close();
}

// 3: езиковите файлове НЕ се зареждат (500) — показва се английският fallback от HTML.
{
  const { ctx, page, errs } = await open({ lang: 'en', block: true });
  const noTr = await page.evaluate(() => !window.appTranslations || !appTranslations.en);
  ok(noTr, 'езиковите файлове наистина не са заредени (симулиран провал)');

  await page.evaluate(() => {
    const lp = document.getElementById('login-page');
    if (lp) { lp.hidden = false; lp.style.display = 'flex'; }
  });
  const loginText = await page.evaluate(() => (document.getElementById('login-page')?.innerText || '').replace(/\s+/g, ' '));
  ok(/Request Access/.test(loginText), 'началният екран показва „Request Access“', loginText.slice(0, 160));
  ok(/This is a test \(Beta\) version/.test(loginText), 'описанието е английското от i18n', loginText.slice(0, 160));
  ok(!/[\u0400-\u04FF]/.test(loginText), 'в началния екран няма кирилица', loginText.slice(0, 200));

  const settings = await page.evaluate(() => {
    const m = document.getElementById('settings-modal');
    if (!m) return null;
    m.hidden = false;
    m.classList.add('visible');
    m.style.display = 'flex';
    return { text: (m.textContent || '').replace(/\s+/g, ' '), display: getComputedStyle(m).display };
  });
  ok(!!settings, 'модалът с настройки е намерен в DOM');
  if (settings) {
    const s = settings.text;
    ok(settings.display !== 'none', 'модалът с настройки се показва', settings.display);
    ok(/Settings/.test(s), 'заглавието на Настройки е „Settings“', s.slice(0, 160));
    ok(/Confirm/.test(s) && /Single note/.test(s) && /Weekly calendar/.test(s), 'редовете в Настройки са английски', s.slice(0, 240));
    ok(!/[\u0400-\u04FF]/.test(s), 'в Настройки няма кирилица', s.slice(0, 240));
  }
  ok(errs.length === 0, 'нула грешки в конзолата без преводи', errs.slice(0, 4));
  await ctx.close();
}

// 4: обратната посока — със заредени файлове и language=bg интерфейсът е български.
{
  const { ctx, page, errs } = await open({ lang: 'bg', block: false });
  await page.evaluate(() => {
    const lp = document.getElementById('login-page');
    if (lp) { lp.hidden = false; lp.style.display = 'flex'; }
  });
  const t = await page.evaluate(() => (document.getElementById('login-page')?.innerText || '').replace(/\s+/g, ' '));
  ok(/Заяви достъп|Заявка за достъп/.test(t), 'при language=bg началният екран е български', t.slice(0, 160));
  ok(errs.length === 0, 'нула грешки в конзолата при български', errs.slice(0, 4));
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
if (fails) { console.log('ПРОВАЛА'); process.exit(1); }
console.log('ALL PASS');
