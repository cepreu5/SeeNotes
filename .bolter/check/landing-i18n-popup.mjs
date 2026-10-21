// Лендинг (uni/index.html): без бета-текста, с попъп за превод на интерфейса при отваряне.
// Проверява:
//   1. бета-текстът ("This is a Beta version of the app ... multinotes.web@gmail.com")
//      го няма нито като елемент, нито в текста на страницата;
//   2. при отваряне попъпът за превод се показва сам, на текущия език, с линка
//      multinotes.app/gdviewer/ui и работещ бутон за затваряне;
//   3. след затваряне попъпът и overlay-ът не блокират кликовете;
//   4. при смяна на езика попъпът излиза отново, вече на новия език;
//   5. при запазен език (localStorage) попъпът при отваряне е на него;
//   6. на 390 попъпът се побира в екрана и няма хоризонтален скрол.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/landing-i18n-popup.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
const URL_ = `http://127.0.0.1:${PORT}/index.html`;

const lang = async (id) => JSON.parse(await readFile(path.join(root, `lang/index-${id}.json`), 'utf8'));
const EN = await lang('en');
const BG = await lang('bg');
const RU = await lang('ru');
const IT = await lang('it');
const ALL_LANGS = { en: EN, bg: BG, ru: RU, it: IT };

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
};

const browser = await chromium.launch();

// ---------- 1280: бета-текст, попъп при отваряне, затваряне, смяна на език ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForSelector('.i18n-popup.visible', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);

  const s = await page.evaluate(() => {
    const popup = document.querySelector('.i18n-popup');
    const overlay = document.querySelector('.i18n-overlay');
    const btn = popup && popup.querySelector('.close-btn');
    const link = popup && popup.querySelector('a.app-link');
    return {
      betaNotice: !!document.querySelector('#beta-notice'),
      bodyText: document.body.innerText,
      popupVisible: !!(popup && popup.classList.contains('visible')),
      overlayVisible: !!(overlay && overlay.classList.contains('visible')),
      title: popup ? (popup.querySelector('h4') || {}).textContent : null,
      msg: popup ? (popup.querySelector('p') || {}).textContent : null,
      btn: btn ? btn.textContent : null,
      link: link ? link.getAttribute('href') : null,
      heroTitle: (document.querySelector('.hero-title') || {}).innerText,
      docW: document.documentElement.scrollWidth,
      winW: innerWidth,
    };
  });

  ok(!s.betaNotice, 'няма елемент #beta-notice');
  ok(!/multinotes\.web@gmail\.com/.test(s.bodyText), 'имейлът от бета-текста не се показва в страницата');
  ok(!/Beta version of the app|тестова \(Beta\) версия|бета-версия приложения/i.test(s.bodyText), 'бета-текстът липсва на всички езици', s.bodyText.slice(0, 200));
  ok(/Your notes|everywhere/i.test(s.heroTitle || ''), 'hero заглавието е на мястото си', s.heroTitle);

  ok(s.popupVisible, 'попъпът се показва при отваряне на страницата');
  ok(s.overlayVisible, 'тъмният overlay е под попъпа');
  ok(s.title === EN.popup_info_title, 'заглавието е от index-en.json', { got: s.title, want: EN.popup_info_title });
  ok(s.msg === EN.popup_info_msg, 'текстът е от index-en.json', { got: s.msg, want: EN.popup_info_msg });
  ok(s.btn === EN.popup_info_btn, 'бутонът е от index-en.json', { got: s.btn, want: EN.popup_info_btn });
  ok(s.link === 'https://multinotes.app/gdviewer/ui', 'линкът към инструмента за превод е същият', s.link);
  ok(s.docW <= s.winW, 'няма хоризонтален скрол', { docW: s.docW, winW: s.winW });

  // Затваряне с бутона
  await page.click('.i18n-popup .close-btn');
  await page.waitForTimeout(600);
  const afterClose = await page.evaluate(() => {
    const popup = document.querySelector('.i18n-popup');
    const overlay = document.querySelector('.i18n-overlay');
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      popupVisible: popup.classList.contains('visible'),
      overlayPe: overlay ? getComputedStyle(overlay).pointerEvents : 'none',
      popupPe: getComputedStyle(popup).pointerEvents,
      centerElement: el ? (el.className || el.tagName) : null,
    };
  });
  ok(!afterClose.popupVisible, 'след „Разбрах“ попъпът се скрива');
  ok(afterClose.overlayPe === 'none' && afterClose.popupPe === 'none', 'след затваряне нищо не блокира кликовете', afterClose);
  ok(!/i18n-(popup|overlay)/.test(String(afterClose.centerElement)), 'в центъра на екрана вече е страницата, не попъпът', afterClose.centerElement);

  // Смяна на езика -> попъпът излиза отново, текстът му остава същият (английски)
  await page.selectOption('.lang-select', 'bg');
  await page.waitForSelector('.i18n-popup.visible', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
  const bgState = await page.evaluate(() => {
    const popup = document.querySelector('.i18n-popup');
    return {
      visible: popup.classList.contains('visible'),
      msg: (popup.querySelector('p') || {}).textContent,
      btn: (popup.querySelector('.close-btn') || {}).textContent,
      lang: localStorage.getItem('language'),
      hero: (document.querySelector('.hero-title') || {}).innerText,
    };
  });
  ok(bgState.visible, 'при смяна на езика попъпът пак се показва');
  ok(bgState.msg === BG.popup_info_msg && bgState.btn === BG.popup_info_btn, 'текстът на попъпа след смяна на езика е както сега (на новия език)', { got: bgState.msg, want: BG.popup_info_msg });
  ok(bgState.hero !== '', 'страницата е преведена на български', bgState.hero);
  ok(bgState.lang === 'bg', 'езикът е запазен', bgState.lang);

  ok(errors.length === 0, 'няма JS грешки', errors);
  await page.close();
}

// ---------- Запазен език: страницата е на него, попъпът пак е на английски ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL_, { waitUntil: 'load' });
  // изчакваме самата страница да си запише езика, иначе презаписва нашия
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.setItem('language', 'bg'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.i18n-popup.visible', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => {
    const popup = document.querySelector('.i18n-popup');
    return {
      visible: popup && popup.classList.contains('visible'),
      title: popup ? (popup.querySelector('h4') || {}).textContent : null,
      msg: popup ? (popup.querySelector('p') || {}).textContent : null,
      btn: popup ? (popup.querySelector('.close-btn') || {}).textContent : null,
      hero: (document.querySelector('.hero-title') || {}).innerText,
      docLang: localStorage.getItem('language'),
    };
  });
  ok(b.visible, 'запазен bg: попъпът се показва при отваряне');
  ok(b.title === 'Information' && b.msg === EN.popup_info_msg && b.btn === EN.popup_info_btn, 'запазен bg: попъпът е на английски', b);
  ok(b.hero.replace(/\s+/g, ' ').trim() === String(BG.hero_title || '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim(), 'запазен bg: самата страница е на български', { got: b.hero, want: BG.hero_title });
  await page.close();
}

// ---------- 390: попъпът се побира, страницата не се разтяга ----------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForSelector('.i18n-popup.visible', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const popup = document.querySelector('.i18n-popup');
    const r = popup.getBoundingClientRect();
    return {
      visible: popup.classList.contains('visible'),
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height),
      winW: innerWidth, winH: innerHeight,
      docW: document.documentElement.scrollWidth,
      betaNotice: !!document.querySelector('#beta-notice'),
    };
  });
  ok(m.visible, '390: попъпът се показва при отваряне');
  ok(!m.betaNotice, '390: бета-текстът го няма');
  ok(m.left >= 0 && m.right <= m.winW, '390: попъпът е изцяло в екрана по хоризонтала', m);
  ok(m.h <= m.winH, '390: попъпът се побира по височина', m);
  ok(m.docW <= m.winW, '390: няма хоризонтален скрол', { docW: m.docW, winW: m.winW });
  await page.close();
}

// ---------- Текстът на попъпа е „превод на потребителския интерфейс“ на всички езици ----------
{
  // статично: четирите езикови файла имат трите ключа и новия текст
  const wantWord = { en: /user interface/i, bg: /интерфейса/i, ru: /интерфейса/i, it: /interfaccia/i };
  for (const [id, L] of Object.entries(ALL_LANGS)) {
    ok(typeof L.popup_info_title === 'string' && L.popup_info_title.trim() !== '', `${id}: има popup_info_title`, L.popup_info_title);
    ok(typeof L.popup_info_msg === 'string' && L.popup_info_msg.trim() !== '', `${id}: има popup_info_msg`, L.popup_info_msg);
    ok(typeof L.popup_info_btn === 'string' && L.popup_info_btn.trim() !== '', `${id}: има popup_info_btn`, L.popup_info_btn);
    ok(wantWord[id].test(L.popup_info_msg), `${id}: текстът казва „превод на интерфейса“`, L.popup_info_msg);
    ok(!/(machine|машинн|машин)/i.test(L.popup_info_msg), `${id}: няма „машинен“ в текста`, L.popup_info_msg);
  }

  // живо: смяна на езика -> попъпът показва текста на съответния език
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForSelector('.i18n-popup.visible', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);
  for (const id of ['ru', 'it', 'en', 'bg']) {
    await page.selectOption('.lang-select', id);
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => {
      const popup = document.querySelector('.i18n-popup');
      return {
        visible: popup.classList.contains('visible'),
        title: (popup.querySelector('h4') || {}).textContent,
        msg: (popup.querySelector('p') || {}).textContent,
        btn: (popup.querySelector('.close-btn') || {}).textContent,
      };
    });
    const L = ALL_LANGS[id];
    ok(st.visible && st.msg === L.popup_info_msg && st.btn === L.popup_info_btn && st.title === L.popup_info_title,
      `смяна на ${id}: попъпът е с текста от index-${id}.json`, { got: st, want: L.popup_info_msg });
  }
  ok(errors.length === 0, 'няма JS грешки при обикаляне на езиците', errors);
  await page.close();

  // it не е в превключвателя: при запазен it страницата се зарежда от index-it.json,
  // а попъпът при отваряне пак е на английски (същото правило като за bg)
  const itPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await itPage.goto(URL_, { waitUntil: 'load' });
  await itPage.waitForTimeout(800);
  await itPage.evaluate(() => localStorage.setItem('language', 'it'));
  await itPage.reload({ waitUntil: 'load' });
  await itPage.waitForSelector('.i18n-popup.visible', { timeout: 4000 }).catch(() => {});
  await itPage.waitForTimeout(500);
  const itState = await itPage.evaluate(() => {
    const popup = document.querySelector('.i18n-popup');
    return {
      visible: popup.classList.contains('visible'),
      title: (popup.querySelector('h4') || {}).textContent,
      msg: (popup.querySelector('p') || {}).textContent,
      btn: (popup.querySelector('.close-btn') || {}).textContent,
      hero: (document.querySelector('.hero-title') || {}).innerText,
    };
  });
  ok(itState.visible && itState.msg === EN.popup_info_msg, 'запазен it: попъпът при отваряне е на английски, както при bg', itState);
  ok(itState.hero.replace(/\s+/g, ' ').trim() === String(IT.hero_title || '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim(),
    'запазен it: самата страница е на италиански (index-it.json се зарежда)', { got: itState.hero, want: IT.hero_title });
  const opts = await itPage.evaluate(() => [...document.querySelectorAll('.lang-select option')].map(o => o.value));
  ok(opts.join(',') === 'en,ru,bg,it', 'превключвателят предлага EN, RU, BG и IT', opts);
  await itPage.close();
}

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
if (fails) { console.log(`${fails} ПРОВАЛЕНИ`); process.exit(1); }
console.log('ALL PASS');
