// b5.47: линк към снимка, споделен от сайт, се показва като снимка в бележката.
// Собственик (24.11.2026): дебъг панелът показа title=Action, text=…gettyimages-…jpg, files=0 —
// Chrome праща само линка към снимката, не файла, затова бележката оставаше с линк.
//
// Проверява се по истинския път за показване (getFormattedNoteHtml, същият за модала и борда):
//   1) ред само със линк към снимка дава картинка в бележката;
//   2) картинката е линк към същия адрес и отваря нов раздел;
//   3) обикновен линк не става картинка;
//   4) адрес в средата на изречение не става картинка;
//   5) в клетка на таблица картинка не се слага;
//   6) бордът (renderNoteContent) показва същото;
//   7) картинката се побира в 240px карта на борда и се зарежда;
//   8) споделяне със заглавие „Action“ дава бележка само с линка, без „Action“;
//   9) в текста на бележката линкът остава непокътнат (в Редактиране човек вижда адреса);
//  10) без грешки в конзолата.

import { chromium } from 'playwright';

const URL = process.env.PAGE || 'http://127.0.0.1:8111/nomn/index.html';
// Истински PNG 400×225: тестът мери реалния размер на снимката, затова файлът трябва да се декодира.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAZAAAADhCAIAAABp1HRLAAAC/ElEQVR4nO3UQQ0AIBDAsJODRCQiCwv8yJImFbDXZu0DkDDfCwAeGRaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARkXPdN/c5Zk6WIAAAAASUVORK5CYII=',
  'base64'
);
const IMG_URL = 'https://forbesbulgaria.com/wp-content/uploads/2026/11/gettyimages-2275810483.jpg';
const PLAIN_URL = 'https://forbesbulgaria.com/statia-za-inflaciyata';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
const imageRequests = [];
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
  const url = route.request().url();
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url.split('#')[0])) {
    imageRequests.push(url);
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return;
  }
  const isScript = /\.js(\?|$)/.test(url);
  await route.fulfill({
    status: 200,
    contentType: isScript ? 'application/javascript' : 'image/gif',
    body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')
  });
});

const page = await ctx.newPage();
const errors = [];
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error' && !/404|Failed to load resource|Refused to execute script/.test(t)) errors.push(t);
});
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => {
  const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
  window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
  window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
  window.kofiWidgetOverlay = { draw() { } };
  window.kofiwidget2 = { init() { }, draw() { } };
  localStorage.setItem('guide', 'false');
  localStorage.setItem('useIndexedDb', 'false');
  localStorage.setItem('language', 'bg');
  localStorage.setItem('singleNoteMode', 'false');
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  try { await startApp(); } catch (e) { window.__startAppError = String(e); }
  boardsData = [{ id: 1, gdid: 'b1', title: 'Main', datemod: Date.now(), status: 0 }];
  allNotesData = [];
  mediaData = [];
  openNotesRestoreDone = true;
});

const swVersion = await page.evaluate(async () => {
  try {
    const txt = await (await fetch('sw.js', { cache: 'no-store' })).text();
    const m = txt.match(/CACHE_NAME\s*=\s*'([^']+)'/);
    return m ? m[1] : '';
  } catch (e) { return ''; }
});
check('sw.js е на версия b5.48', /b5\.48/.test(swVersion), swVersion);

// 1-2. Модалът (isForModal = true).
const modalHtml = await page.evaluate((u) => getFormattedNoteHtml(u, null, null, true), IMG_URL);
check('линкът към снимка става картинка', /class="nm-img-card"/.test(modalHtml) && /class="nm-img-shot"/.test(modalHtml), modalHtml.slice(0, 200));
check('картинката е линк към същия адрес, в нов раздел',
  modalHtml.includes(`href="${IMG_URL}"`) && /nm-img-card[^>]*target="_blank"/.test(modalHtml) && /nm-img-card[^>]*rel="noopener noreferrer"/.test(modalHtml));
check('картинката е самият адрес, без реферер',
  /class="nm-img-shot" src="[^"]*gettyimages-2275810483\.jpg"/.test(modalHtml) && /nm-img-shot[^>]*referrerpolicy="no-referrer"/.test(modalHtml));
check('адресът не се дублира като текст под снимката', (modalHtml.match(/gettyimages-2275810483/g) || []).length === 2, modalHtml.slice(0, 240));

// 3-4. Обикновен линк и адрес в изречение.
const others = await page.evaluate(({ img, plain }) => ({
  plain: getFormattedNoteHtml('Статия\n' + plain, null, null, true).replace(/https:\/\/forbesbulgaria\.com\/statia-za-inflaciyata/g, 'PLAIN'),
  inline: getFormattedNoteHtml('Ето снимката ' + img + ' и още текст', null, null, true)
}), { img: IMG_URL, plain: PLAIN_URL });
check('обикновен линк не става картинка', !/nm-img-card/.test(others.plain) && /<a href=/.test(others.plain), others.plain.slice(0, 140));
check('адрес в средата на изречение остава линк', !/nm-img-card/.test(others.inline) && /<a href=/.test(others.inline));

// 5. Клетка на таблица.
const tableHtml = await page.evaluate((u) =>
  getFormattedNoteHtml('| Снимка | Бележка |\n| --- | --- |\n| ' + u + ' | текст |', null, null, true), IMG_URL);
check('в клетка на таблица картинка не се слага', !/nm-img-card/.test(tableHtml) && /md-table/.test(tableHtml), tableHtml.slice(0, 140));

// 6. Бордът.
const boardHtml = await page.evaluate((u) => renderNoteContent(u), IMG_URL);
check('бордът показва същата картинка', /nm-img-card/.test(boardHtml) && /nm-img-shot/.test(boardHtml), boardHtml.slice(0, 160));

// 7. Мярка в истинска страница 240px (карта на борда) + зареждане на картинката.
const measured = await page.evaluate(async (html) => {
  const box = document.createElement('div');
  box.className = 'note-content';
  box.style.width = '240px';
  // Мярката се слага най-отгоре и видима: картинката е с loading="lazy" и извън екрана не се тегли.
  box.style.cssText += 'position:fixed;top:0;left:0;z-index:99999;background:#fff;';
  box.innerHTML = html;
  document.body.appendChild(box);
  const card = box.querySelector('.nm-img-card');
  const img = box.querySelector('.nm-img-shot');
  if (img) {
    await new Promise(r => {
      if (img.complete && img.naturalWidth) return r();
      img.onload = r; img.onerror = r;
      setTimeout(r, 4000);
    });
  }
  const r = card ? card.getBoundingClientRect() : null;
  const ir = img ? img.getBoundingClientRect() : null;
  const out = {
    cardWidth: r ? Math.round(r.width) : 0,
    cardHeight: r ? Math.round(r.height) : 0,
    imgWidth: ir ? Math.round(ir.width) : 0,
    natural: img ? img.naturalWidth : 0,
    loaded: !!img && img.complete && img.naturalWidth > 0,
    vh: Math.round(window.innerHeight * 0.45)
  };
  box.remove();
  return out;
}, modalHtml);
check('снимката се побира в 240px карта на борда', measured.cardWidth > 0 && measured.cardWidth <= 240 && measured.imgWidth <= 240, JSON.stringify(measured));
check('снимката се зарежда от адреса', measured.loaded, JSON.stringify(measured));
check('височината е под тавана 45% от екрана', measured.cardHeight > 0 && measured.cardHeight <= measured.vh + 40, JSON.stringify(measured));

// 8-9. Целият път: споделяне със служебно заглавие „Action“.
const shareResult = await page.evaluate(async (u) => {
  const realShowModal = window.showModal;
  window.__captured = null;
  window.showModal = (opts, el) => { window.__captured = opts; return realShowModal(opts, el); };
  try {
    await handleShareTarget({ shared_title: 'Action', shared_text: u, shared_url: null, shared_image: null, sid: 'sh-test-img' });
  } catch (e) { return { error: String(e) }; }
  await new Promise(r => setTimeout(r, 1200));
  window.showModal = realShowModal;
  const raw = window.__captured ? String(window.__captured.raw) : null;
  return {
    raw,
    preview: raw ? getFormattedNoteHtml(raw, null, null, true) : ''
  };
}, IMG_URL);
check('споделянето стига до бележка', !shareResult.error && !!shareResult.raw, JSON.stringify({ error: shareResult.error, raw: shareResult.raw }));
check('бележката е само линкът, без „Action“', !!shareResult.raw && shareResult.raw.trim() === IMG_URL, JSON.stringify(shareResult.raw));
check('Преглед на тази бележка показва снимката', /nm-img-card/.test(shareResult.preview || ''));
check('в текста на бележката линкът остава непокътнат', !!shareResult.raw && shareResult.raw.includes('gettyimages-2275810483.jpg'));

// 9б. Истинско заглавие при споделяне на снимка НЕ се губи (само служебното „Action“ отпада).
const titledShare = await page.evaluate(async (u) => {
  const realShowModal = window.showModal;
  window.__captured = null;
  window.showModal = (opts, el) => { window.__captured = opts; return realShowModal(opts, el); };
  try {
    await handleShareTarget({ shared_title: 'Празникът на будителите', shared_text: u, shared_url: null, shared_image: null, sid: 'sh-test-img-title' });
  } catch (e) { return { error: String(e) }; }
  await new Promise(r => setTimeout(r, 1200));
  window.showModal = realShowModal;
  const raw = window.__captured ? String(window.__captured.raw) : null;
  return { raw, preview: raw ? getFormattedNoteHtml(raw, null, null, true) : '' };
}, IMG_URL);
check('истинско заглавие остава в бележката', !!titledShare.raw && titledShare.raw.includes('Празникът на будителите'), JSON.stringify(titledShare.raw));
check('и тогава линкът се показва като снимка', /nm-img-card/.test(titledShare.preview || ''));

check('поискани са само картинки', imageRequests.every(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u.split('#')[0])), imageRequests.join(' | '));
check('без грешки в конзолата', errors.length === 0, errors.slice(0, 3).join(' | '));

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} проверки минават`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
