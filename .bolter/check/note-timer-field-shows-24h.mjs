// Какво ВИЖДА човек в полето за час на панела „Аларма“ (b3.63).
// Повод: собственикът на телефон с 24-часов часовник видя „2:05 PM“ — браузърът рисува
// <input type="time"> по своя език, не по настройката на устройството, и кодът не може да го смени.
// Поправката: вградената рисунка на полето е прозрачна, а отгоре стои собствен слой
// (.note-timer-alarm-face) с часа по настройката на устройството.
// Проверява върху истинската страница uni/index.html + uni/main.js:
//   1) при 24-часова система (дори когато браузърът е на английски и рисува 12 часа) видимият
//      текст в полето е „14:05“, точно колкото е стойността на полето;
//   2) вградената рисунка на браузъра е невидима — иначе двата текста щяха да се застъпят;
//   3) при 12-часова система видимият текст е „2:05 PM“ с означения от езика;
//   4) текстът е центриран в полето, не застъпва стрелката за избор и не излиза от панела;
//   5) слойът следва избора от часовника и отварянето на вече зададена аларма.
// Пуска се от корена на хранилището (SeeNotes):
//   node .bolter/check/note-timer-field-shows-24h.mjs     (exit 1 при провалена проверка)
//   ROOT=/tmp/b362/uni node .bolter/check/note-timer-field-shows-24h.mjs    (контрола)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

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

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 600) : ''));
  if (!cond) fails++;
};

const DIAL = '#clock-201';

// system24: езикът на системата носи -u-hc-h23 (24-часов час), но Intl по подразбиране го
// пропуска и браузърът рисува полето 12-часово — точно случаят от телефона на собственика.
async function boot(locale, lang, { android24 = false, viewport = { width: 390, height: 844 } } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', locale });
  await ctx.addInitScript(l => {
    try {
      localStorage.setItem('language', l);
      localStorage.setItem('hideAssistant', 'true');
      localStorage.setItem('notesBgrd', 'false');
    } catch (e) { }
  }, lang);
  if (android24) {
    await ctx.addInitScript(() => {
      const Orig = Intl.DateTimeFormat;
      const Patched = function (locales, options) {
        return new Orig(locales === undefined ? 'en-US' : locales, options);
      };
      Patched.prototype = Orig.prototype;
      Patched.supportedLocalesOf = Orig.supportedLocalesOf;
      Intl.DateTimeFormat = Patched;
    });
  }
  await ctx.addInitScript(() => {
    window.gapi = {
      load() { },
      client: {
        setToken() { },
        getToken() { return { access_token: 'tok' }; },
        drive: { files: { list: () => Promise.resolve({ result: { files: [] } }), get: () => Promise.resolve({ result: {} }) } },
      },
      auth: { getToken() { return { access_token: 'tok' }; } },
    };
  });
  await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
    const url = route.request().url();
    if (url.startsWith('https://accounts.google.com/gsi/client')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
    }
    if (url.startsWith('https://storage.ko-fi.com/')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof createNoteElement === 'function', null, { timeout: 20000 });
  await page.evaluate(`(async () => {
    notesContainer = document.getElementById('notes-container');
    if (!boardsData.some(b => b.gdid === 'B1')) boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' });
    currentBoardFilter = 'all';
    const now = Date.now();
    const mk = (id, txt) => ({
      alarm_type: -1, boardid: 'B1', calendarDate: 0, color: 0, date: now - 60000, datemod: now - 30000,
      eventId: 0, gdid: 'GN' + id, id, notetxt: txt, numord: id, sellist: 0, status: 0,
      text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1,
    });
    allNotesData = [mk(201, 'бележка с таймер')];
    notesContainer.innerHTML = '';
    const els = await Promise.all(allNotesData.map(nt => createNoteElement(nt)));
    els.forEach(el => { if (el) notesContainer.appendChild(el); });
    applyFilters();
  })()`);
  await page.waitForTimeout(400);
  await page.click('#notes-container .note[data-i="201"] .note-header-time');
  await page.waitForSelector(DIAL, { timeout: 5000 });
  return { browser, page, errs };
}

const openPicker = async (page, mode) => {
  const open = await page.evaluate((sel) => {
    const p = document.querySelector(sel + ' .note-timer-picker');
    return !!p && !p.hidden;
  }, DIAL);
  if (!open) {
    await page.click(DIAL, { modifiers: ['Control'] });
    await page.waitForTimeout(200);
  }
  if (mode) {
    await page.click(`${DIAL} .note-timer-mode[data-note-timer-mode="${mode}"]`);
    await page.waitForTimeout(150);
  }
};

// Какво е в полето: стойността (24-часова, каквато приема DOM API-то) и видимият текст отгоре.
const fieldState = (page) => page.evaluate((sel) => {
  const picker = document.querySelector(sel + ' .note-timer-picker');
  const field = picker.querySelector('.note-timer-alarm-field');
  const input = picker.querySelector('.note-timer-alarm-time');
  const face = picker.querySelector('.note-timer-alarm-face');
  const pv = picker.getBoundingClientRect();
  const fr = field ? field.getBoundingClientRect() : null;
  const ir = input.getBoundingClientRect();
  const cs = getComputedStyle(input);
  const fs = face ? getComputedStyle(face) : null;
  const far = face ? face.getBoundingClientRect() : null;
  const scale = pv.width / 112;
  const alpha = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const parts = m[1].split(',').map(v => parseFloat(v));
    return parts.length > 3 ? parts[3] : 1;
  };
  return {
    value: input.value,
    faceText: face ? (face.textContent || '').trim() : null,
    hasField: !!field,
    hasFace: !!face,
    faceAfterInput: !!(field && field.children[1] === face),
    inputColorAlpha: alpha(cs.color),
    inputFillAlpha: alpha(cs.webkitTextFillColor),
    inputRect: { l: Math.round(ir.left), r: Math.round(ir.right), w: Math.round(ir.width), h: Math.round(ir.height) },
    faceRect: far ? { l: Math.round(far.left), r: Math.round(far.right), w: Math.round(far.width), h: Math.round(far.height) } : null,
    faceVisible: !!fs && fs.display !== 'none' && fs.visibility === 'visible' && parseFloat(fs.opacity) > 0.9,
    faceFits: face ? face.scrollWidth <= face.clientWidth + 1 : false,
    panel: { w: Math.round(pv.width), h: Math.round(pv.height), l: Math.round(pv.left), r: Math.round(pv.right) },
    // Контролата срещу стария код няма обвивка на полето — тогава рамката е на самото поле.
    fieldRect: { l: Math.round((fr || ir).left), r: Math.round((fr || ir).right), w: Math.round((fr || ir).width) },
    inner: { l: Math.round(pv.left + 5 * scale), r: Math.round(pv.right - 5 * scale) },
    hour12: noteTimerUsesHour12(),
  };
}, DIAL);

const pad = v => String(v).padStart(2, '0');

// ─────────── 1: 24-часова система, браузър на английски (случаят от телефона) ───────────
{
  const { browser, page, errs } = await boot('en-US-u-hc-h23', 'bg', { android24: true });
  await openPicker(page, 'alarm');
  const st = await fieldState(page);
  ok(st.hour12 === false, 'системата се разпознава като 24-часова', st);
  ok(st.hasFace === true, 'полето има собствен слой с видим текст', st);
  ok(/^\d{2}:\d{2}$/.test(st.value) && st.value === st.faceText,
    `видимият текст в полето е „${st.faceText}“ и съвпада със стойността „${st.value}“`, st);
  ok(!/AM|PM/.test(String(st.faceText)), `в текста няма AM/PM („${st.faceText}“)`, st);
  ok(st.inputColorAlpha === 0 && st.inputFillAlpha === 0,
    'собствената рисунка на браузъра в полето е прозрачна (не се вижда втори час)', st);
  ok(st.faceVisible && st.faceFits, 'слоят се вижда и текстът му се побира', st);
  ok(st.faceAfterInput, 'слоят е след полето в подредбата, значи се рисува отгоре', st);
  ok(st.faceRect && st.faceRect.r <= st.inputRect.r - 14,
    'текстът не застъпва стрелката за избор на часа', st);
  ok(st.faceRect && Math.abs((st.faceRect.l + st.faceRect.r) / 2 - (st.inputRect.l + st.inputRect.r - 17) / 2) <= 2,
    'текстът е центриран в полето', st);
  ok(st.fieldRect && st.fieldRect.l >= st.inner.l - 0.6 && st.fieldRect.r <= st.inner.r + 0.6,
    'полето остава в рамката на панела', st);

  // Нищо от вградената рисунка не се вижда: при скрит наш слой две различни стойности изглеждат
  // еднакво на екрана. Ако браузърът си рисуваше часа, снимките щяха да се различават.
  // Панелът е леко прозрачен (rgba(18,18,18,0.94)) и под него се движат стрелките на циферблата,
  // затова за снимката фонът му се прави плътен — иначе всяка секунда мени пиксели.
  const clip = await page.evaluate((sel) => {
    const picker = document.querySelector(sel + ' .note-timer-picker');
    picker.dataset.savedBg = picker.style.background || '';
    picker.style.background = '#121212';
    // Контролата срещу стария код няма .note-timer-alarm-field — тогава се мери самото поле.
    const el = picker.querySelector('.note-timer-alarm-field') || picker.querySelector('.note-timer-alarm-time');
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  }, DIAL);
  await page.evaluate((sel) => {
    const face = document.querySelector(sel + ' .note-timer-alarm-face');
    if (face) face.style.display = 'none';
  }, DIAL);
  const setValue = (v) => page.evaluate(({ sel, v }) => {
    const inp = document.querySelector(sel + ' .note-timer-alarm-time');
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, { sel: DIAL, v });
  await setValue('14:05');
  await page.waitForTimeout(150);
  const shotA = await page.screenshot({ clip });
  await setValue('09:30');
  await page.waitForTimeout(150);
  const shotB = await page.screenshot({ clip });
  ok(shotA.equals(shotB), 'без нашия слой полето изглежда еднакво при 14:05 и 09:30 — браузърът не рисува свой час', { a: shotA.length, b: shotB.length });
  await page.evaluate((sel) => {
    const face = document.querySelector(sel + ' .note-timer-alarm-face');
    if (face) face.style.display = '';
  }, DIAL);
  await page.waitForTimeout(150);
  const shotC = await page.screenshot({ clip });
  ok(!shotC.equals(shotB), 'с нашия слой в полето има видим текст', { c: shotC.length });

  // Изборът от часовника се отразява веднага.
  await setValue('07:45');
  await page.waitForTimeout(120);
  const picked = await fieldState(page);
  ok(picked.faceText === '07:45', `след избор на 07:45 полето показва „${picked.faceText}“`, picked);

  // Отваряне на вече зададена аларма.
  await page.evaluate((sel) => {
    const target = Date.now() + 7 * 60000;
    noteTimerStart(201, target - Date.now(), 'alarm');
    document.querySelector(sel + ' .note-timer-picker').hidden = true;
  }, DIAL);
  await openPicker(page, 'alarm');
  const reopened = await fieldState(page);
  const d = new Date(Date.now() + 7 * 60000);
  const expect = pad(d.getHours()) + ':' + pad(d.getMinutes());
  ok(reopened.faceText === expect, `при отваряне на готовата аларма полето показва „${reopened.faceText}“ (${expect})`, reopened);
  const shot = await page.evaluate((sel) => {
    const picker = document.querySelector(sel + ' .note-timer-picker');
    picker.style.background = picker.dataset.savedBg || '';
    const r = picker.getBoundingClientRect();
    return { x: Math.round(r.left) - 6, y: Math.round(r.top) - 6, width: Math.round(r.width) + 12, height: Math.round(r.height) + 12 };
  }, DIAL);
  await page.screenshot({ path: '.bolter/check/note-timer-field-24h-390.png', clip: shot });
  ok(errs.length === 0, `няма грешки в конзолата (${errs.length})`, errs);
  await browser.close();
}

// ─────────── 2: 12-часова система (английска) — както преди, с AM/PM ───────────
{
  const { browser, page, errs } = await boot('en-US', 'en');
  await openPicker(page, 'alarm');
  const st = await fieldState(page);
  const d = new Date();
  d.setHours(Number(String(st.value).slice(0, 2)), Number(String(st.value).slice(3, 5)), 0, 0);
  const h = d.getHours();
  const expect12 = (h % 12 || 12) + ':' + pad(d.getMinutes()) + ' ' + (h < 12 ? 'AM' : 'PM');
  ok(st.hour12 === true, 'американската система се разпознава като 12-часова', st);
  ok(st.faceText === expect12, `видимият текст е „${st.faceText}“ (очаквано „${expect12}“)`, st);
  ok(st.inputFillAlpha === 0, 'и тук собствената рисунка на браузъра е прозрачна', st);
  ok(errs.length === 0, `няма грешки в конзолата (${errs.length})`, errs);
  await browser.close();
}

// ─────────── 3: тесен екран — нищо не излиза от панела ───────────
{
  const { browser, page, errs } = await boot('en-US-u-hc-h23', 'bg', { android24: true, viewport: { width: 320, height: 568 } });
  await openPicker(page, 'alarm');
  await page.evaluate((sel) => {
    const inp = document.querySelector(sel + ' .note-timer-alarm-time');
    inp.value = '23:59';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, DIAL);
  await page.waitForTimeout(150);
  const st = await fieldState(page);
  ok(st.faceText === '23:59', `на 320px полето показва „${st.faceText}“`, st);
  ok(st.fieldRect.l >= st.inner.l - 0.6 && st.fieldRect.r <= st.inner.r + 0.6,
    'на 320px полето не излиза от панела', { st });
  ok(st.faceFits, 'на 320px текстът се побира в полето', st);
  ok(st.panel.w <= 96, `панелът остава тесен (${st.panel.w} px на екрана)`, st.panel);
  ok(errs.length === 0, `няма грешки в конзолата (${errs.length})`, errs);
  await browser.close();
}

console.log(fails === 0 ? `\nвсички ${n} проверки минават` : `\n${fails} от ${n} проверки падат`);
srv.close();
process.exit(fails === 0 ? 0 : 1);
