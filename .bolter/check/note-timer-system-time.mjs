// Часът на алармата по настройката на системата, надписите на панела и рамката му (b3.62).
// Проверява върху истинската страница uni/index.html + uni/main.js:
//   1) при система с 24-часов час панелът показва 24-часов час, дори когато браузърът крие
//      тази настройка от Intl по подразбиране (така се държи Android WebView);
//   2) при 12-часова система панелът показва 12-часов час с AM/PM, а полето за избор винаги
//      получава 24-часова стойност и не остава празно при отваряне на готова аларма;
//   3) надписите в панела следват езика на приложението и се сменят при смяна на езика;
//   4) нищо в панела не излиза извън рамката му (и при по-дълъг надпис).
// Пуска се от корена на хранилището (SeeNotes):
//   node .bolter/check/note-timer-system-time.mjs     (exit 1 при провалена проверка)
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
// пропуска — точно както в Android WebView, заради което панелът излизаше 12-часов.
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
        // Без изрично зададен език WebView ползва езика без разширението -u-hc- (12 часа).
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

// Часът на алармата, който панелът показва, и какво има в полето за избор.
const alarmState = (page, offsetMin) => page.evaluate(({ sel, offsetMin }) => {
  const target = Date.now() + offsetMin * 60000;
  noteTimerStart(201, target - Date.now(), 'alarm');
  const el = document.querySelector(sel + ' .note-timer-readout');
  const d = new Date(target);
  const pad = v => String(v).padStart(2, '0');
  const h = d.getHours();
  return {
    text: (el.textContent || '').trim(),
    value24: pad(h) + ':' + pad(d.getMinutes()),
    value12: (h % 12 || 12) + ':' + pad(d.getMinutes()) + ' ' + (h < 12 ? 'AM' : 'PM'),
    hour12: noteTimerUsesHour12(),
    deviceHour12: getDeviceHour12(),
  };
}, { sel: DIAL, offsetMin });

// ───────────────────── 1: система с 24-часов час, скрит от Intl по подразбиране ─────────────────────
{
  const { browser, page, errs } = await boot('en-US-u-hc-h23', 'bg', { android24: true });
  await openPicker(page, 'alarm');
  const st = await alarmState(page, 7);
  ok(st.hour12 === false, 'системната настройка се разпознава като 24-часова (не по Intl по подразбиране)', st);
  ok(/^\d{2}:\d{2}$/.test(st.text), `панелът показва часа 24-часов (${st.text}, при 12-часов би било ${st.value12})`, st);
  ok(st.text === st.value24, `панелът показва точно ${st.value24}`, st);

  // Отваряне на готова аларма: в полето трябва да е 24-часовата стойност, не „7:05 PM“.
  await page.evaluate(() => { const p = document.querySelector('#clock-201 .note-timer-picker'); p.hidden = true; });
  await openPicker(page, 'alarm');
  const field = await page.evaluate((sel) => {
    const inp = document.querySelector(sel + ' .note-timer-alarm-time');
    return { value: inp.value, mode: document.querySelector(sel + ' .note-timer-picker').dataset.noteTimerMode };
  }, DIAL);
  ok(/^\d{2}:\d{2}$/.test(field.value), `полето за избор приема само 24-часова стойност („${field.value}“)`, field);
  ok(field.value === st.value24, `при отваряне на алармата полето показва ${st.value24}`, { field, st });
  ok(errs.length === 0, `няма грешки в конзолата (${errs.length})`, errs);
  await browser.close();
}

// ───────────────────────────────── 2: 12-часова система ─────────────────────────────────
{
  const { browser, page, errs } = await boot('en-US', 'en');
  await openPicker(page, 'alarm');
  const st = await alarmState(page, 9);
  ok(st.hour12 === true, 'американската система се разпознава като 12-часова', st);
  ok(/AM|PM/.test(st.text), `панелът показва часа 12-часов с AM/PM (${st.text})`, st);
  ok(st.text === st.value12, `панелът показва точно ${st.value12}`, st);

  await page.evaluate(() => { const p = document.querySelector('#clock-201 .note-timer-picker'); p.hidden = true; });
  await openPicker(page, 'alarm');
  const field = await page.evaluate((sel) => document.querySelector(sel + ' .note-timer-alarm-time').value, DIAL);
  ok(/^\d{2}:\d{2}$/.test(field), `при 12-часова система полето пак е 24-часово („${field}“, преди „）“`, field);
  ok(field === st.value24, `при 12-часова система полето показва ${st.value24}, не ${st.value12}`, { field, st });
  ok(errs.length === 0, `няма грешки в конзолата (${errs.length})`, errs);
  await browser.close();
}

// ───────────────────── 3: надписите следват езика на приложението ─────────────────────
{
  const { browser, page, errs } = await boot('bg-BG', 'bg');
  await openPicker(page, 'alarm');
  const labels = () => page.evaluate((sel) => {
    const p = document.querySelector(sel + ' .note-timer-picker');
    return {
      timer: p.querySelector('.note-timer-mode[data-note-timer-mode="timer"]').textContent,
      alarm: p.querySelector('.note-timer-mode[data-note-timer-mode="alarm"]').textContent,
      set: p.querySelector('.note-timer-alarm-set').textContent,
      stop: p.querySelector('.note-timer-stop').textContent,
    };
  }, DIAL);

  const bg = await labels();
  ok(bg.timer === 'Таймер' && bg.alarm === 'Аларма' && bg.set === 'Задай' && bg.stop === 'Стоп',
    'панелът е на български при българско приложение', bg);

  await page.evaluate(() => setLanguage('en'));
  await page.waitForTimeout(300);
  const en = await labels();
  ok(en.timer === 'Timer' && en.alarm === 'Alarm' && en.set === 'Set' && en.stop === 'Stop',
    'след смяна на езика панелът минава на английски, без да се създава наново', en);

  await page.evaluate(() => setLanguage('bg'));
  await page.waitForTimeout(300);
  const back = await labels();
  ok(back.timer === 'Таймер' && back.set === 'Задай', 'след връщане на български панелът пак е български', back);
  const aria = await page.evaluate((sel) => document.querySelector(sel + ' .note-timer-alarm-time').getAttribute('aria-label'), DIAL);
  ok(aria === 'Аларма', `полето за час има български надпис за екранен четец („${aria}“)`, aria);
  ok(errs.length === 0, `няма грешки в консолата (${errs.length})`, errs);
  await browser.close();
}

// ───────────── 4: нищо в панела не излиза извън рамката му ─────────────
const frameCheck = (page) => page.evaluate((sel) => {
  const p = document.querySelector(sel + ' .note-timer-picker');
  const pr = p.getBoundingClientRect();
  const scale = pr.width / 112; // панелът е 112 px в стиловете, толкова е и на екрана след мащаба
  const inner = { l: pr.left + 5 * scale, r: pr.right - 5 * scale, t: pr.top + 5 * scale, b: pr.bottom - 5 * scale };
  const kids = [...p.querySelectorAll('.note-timer-modes, .note-timer-mode, .note-timer-body, .note-timer-alarm-time, .note-timer-alarm-set, .note-timer-stop, .note-timer-pick, .note-timer-picker-grid')];
  const out = kids.map(el => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return { cls: el.className, ok: true, skipped: true }; // скрит режим
    return {
      cls: el.className, ok: r.left >= inner.l - 0.6 && r.right <= inner.r + 0.6 && r.top >= inner.t - 0.6 && r.bottom <= inner.b + 0.6,
      over: Math.round(Math.max(inner.l - r.left, r.right - inner.r, inner.t - r.top, r.bottom - inner.b) * 10) / 10,
    };
  });
  return { panel: { w: Math.round(pr.width), h: Math.round(pr.height) }, inner: { w: Math.round(inner.r - inner.l) }, out };
}, DIAL);

for (const [locale, lang, tag, android24] of [
  ['bg-BG', 'bg', '24 ч, български', false],
  ['en-US', 'en', '12 ч, английски', false],
  ['en-US-u-hc-h23', 'bg', '24 ч скрит от Intl', true],
]) {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    const { browser, page } = await boot(locale, lang, { android24, viewport });
    await openPicker(page, 'alarm');
    const timer = await frameCheck(page);
    await openPicker(page, 'timer');
    const timerMode = await frameCheck(page);
    await openPicker(page, 'alarm');
    // най-лошият случай: дълъг надпис на „Задай“ — трябва да се съкрати, не да излезе от панела
    await page.evaluate((sel) => {
      document.querySelector(sel + ' .note-timer-alarm-set').textContent = 'Задай алармата';
    }, DIAL);
    const longLabel = await frameCheck(page);
    const bad = [...timer.out, ...timerMode.out, ...longLabel.out].filter(o => !o.ok);
    ok(bad.length === 0,
      `нищо не излиза от панела (${tag}, ${viewport.width}px; панел ${timer.panel.w}x${timer.panel.h})`,
      bad);
    ok(timer.panel.w <= 96,
      `панелът остава тесен (${tag}, ${viewport.width}px: ${timer.panel.w} px на екрана)`, timer.panel);
    await browser.close();
  }
}

console.log(fails === 0 ? `\nвсички ${n} проверки минават` : `\n${fails} от ${n} проверки падат`);
srv.close();
process.exit(fails === 0 ? 0 : 1);
