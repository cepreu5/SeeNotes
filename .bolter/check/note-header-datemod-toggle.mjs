// Настройка „Покажи дата на промяна/календар“ в хедъра на бележката (клон cx-notes).
// Проверява върху истинската страница uni/index.html + uni/main.js:
//   - при изключена настройка (showDatemod=false) ТЕКСТЪТ на датата и часа изчезва,
//     но отляво остава иконата на календара, а отдясно остават иконата на часовника
//     и пин-бутонът, един до друг;
//   - иконата на календара при скрита дата отваря седмичния мини календар,
//     иконата на часовника пуска аналоговия часовник;
//   - при включена настройка (showDatemod=true) датата и часът се виждат като текст,
//     а иконите не се дублират.
// Пуска се от корена на хранилището (SeeNotes):
//   node .bolter/check/note-header-datemod-toggle.mjs      (exit 1 при провалена проверка)
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
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 500) : ''));
  if (!cond) fails++;
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });

async function boot(hideDatemod) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript((hide) => {
    try {
      localStorage.setItem('language', 'bg');
      localStorage.setItem('hideAssistant', 'true');
      localStorage.setItem('notesBgrd', 'false');
      localStorage.setItem('showDatemod', hide ? 'true' : 'true');
    } catch (e) { }
  }, hideDatemod);
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
  page.setDefaultTimeout(4000);
  await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof createNoteElement === 'function', null, { timeout: 20000 });
  await page.evaluate(`(async () => {
    notesContainer = document.getElementById('notes-container');
    searchBox = document.getElementById('search-box');
    if (!boardsData.some(b => b.gdid === 'B1')) boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' });
    currentBoardFilter = 'all';
    const now = Date.now();
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const mk = (id, txt, numord, color, extra) => Object.assign({
      alarm_type: -1, boardid: 'B1', calendarDate: 0, color, date: now - 60000, datemod: now - 30000,
      eventId: 0, gdid: 'GN' + id, id, notetxt: txt, numord, sellist: 0, status: 0,
      text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1,
    }, extra || {});
    const notes = [
      mk(201, 'бележка с дата', 1, 0, { calendarDate: today0.getTime() + 3600000 * 10 }),
      mk(202, 'бележка с напомняне', 2, 3, { timer: now + 3600000 }),
    ];
    allNotesData = notes;
    notesContainer.innerHTML = '';
    const els = await Promise.all(notes.map(nt => createNoteElement(nt)));
    els.forEach(el => { if (el) notesContainer.appendChild(el); });
    applyFilters();
  })()`);
  await page.waitForTimeout(300);
  // Настройката се сменя през истинския чекбокс, не чрез localStorage: така се проверява
  // и връзката „чекбокс -> клас на body -> хедър“, а не само CSS-ът.
  if (hideDatemod) {
    await page.evaluate(async () => { if (typeof modalBody === 'undefined' || !modalBody) modalBody = document.getElementById('modal-body') || document.body; await createSettingsUI([], false); });
    await page.waitForFunction(() => !!document.getElementById('show-datemod-checkbox'), null, { timeout: 20000 });
    await page.evaluate(() => {
      const cb = document.getElementById('show-datemod-checkbox');
      if (cb && cb.checked) cb.click();
    });
    await page.waitForFunction(() => document.body.classList.contains('hide-datemod'), null, { timeout: 5000 });
  } else {
    await page.evaluate(async () => { if (typeof modalBody === 'undefined' || !modalBody) modalBody = document.getElementById('modal-body') || document.body; await createSettingsUI([], false); });
    await page.waitForFunction(() => !!document.getElementById('show-datemod-checkbox'), null, { timeout: 20000 });
    const checked = await page.evaluate(() => document.getElementById('show-datemod-checkbox').checked);
    ok(checked === true, `включена настройка: чекбоксът е отметнат при запазено 'true' (${checked})`, checked);
  }
  await page.waitForTimeout(200);
  return { ctx, page, errs };
}

const SEL = (id) => `#notes-container .note[data-i="${id}"]`;

// ---- 1. Настройката е ИЗКЛЮЧЕНА: само икони ----
{
  const { ctx, page, errs } = await boot(true);
  const h = await page.evaluate((sel) => {
    const note = document.querySelector(sel);
    if (!note) return { missingNote: true };
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), right: Math.round(r.right) }; };
    const dateEl = note.querySelector('.note-header-date');
    const timeEl = note.querySelector('.note-header-time');
    const calIcon = note.querySelector('.note-header-calendar-icon');
    const clockIcon = note.querySelector('.note-header-clock-icon');
    const pin = note.querySelector('.note-pin-btn');
    const dateText = note.querySelector('.note-header-date-text');
    const timeText = note.querySelector('.note-header-time-text');
    return {
      bodyClass: document.body.classList.contains('hide-datemod'),
      noteRight: Math.round(note.getBoundingClientRect().right),
      dateTextDisplay: dateText ? getComputedStyle(dateText).display : null,
      timeTextDisplay: timeText ? getComputedStyle(timeText).display : null,
      dateTextValue: dateText ? dateText.textContent.trim() : null,
      timeTextValue: timeText ? timeText.textContent.trim() : null,
      calDisplay: calIcon ? getComputedStyle(calIcon).display : null,
      clockDisplay: clockIcon ? getComputedStyle(clockIcon).display : null,
      calHasSvg: !!(calIcon && calIcon.querySelector('svg')),
      clockHasSvg: !!(clockIcon && clockIcon.querySelector('svg')),
      cal: box(calIcon), clock: box(clockIcon), pin: box(pin), date: box(dateEl), time: box(timeEl),
    };
  }, SEL(201));
  ok(h.bodyClass === true, 'изключена настройка: body носи .hide-datemod', h);
  ok(h.dateTextDisplay === 'none', `изключена настройка: текстът на датата е скрит (${h.dateTextDisplay})`, h);
  ok(h.timeTextDisplay === 'none', `изключена настройка: текстът на часа е скрит (${h.timeTextDisplay})`, h);
  ok(h.calDisplay !== 'none' && h.calHasSvg, `изключена настройка: иконата на календара се вижда отляво (${h.calDisplay})`, h);
  ok(h.clockDisplay !== 'none' && h.clockHasSvg, `изключена настройка: иконата на часовника се вижда отдясно (${h.clockDisplay})`, h);
  ok(!!h.cal && !!h.pin && h.cal.x < h.pin.x - 50, `изключена настройка: календарът е отляво, пинът отдясно (${h.cal && h.cal.x} < ${h.pin && h.pin.x})`, h);
  ok(!!h.clock && !!h.pin && h.clock.right <= h.pin.x + 2,
    `изключена настройка: часовникът е преди пин-бутона (${h.clock && h.clock.right} <= ${h.pin && h.pin.x})`, h);
  const gap = h.clock && h.pin ? h.pin.x - h.clock.right : null;
  ok(gap !== null && gap >= 0 && gap <= 12, `изключена настройка: между часовника и пина има 0-12px (${gap})`, h);

  const hTimer = await page.evaluate((sel) => {
    const note = document.querySelector(sel);
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }; };
    const clockEl = note ? note.querySelector('.note-header-clock-icon') : null;
    return {
      clock: box(clockEl),
      pin: box(note ? note.querySelector('.note-pin-btn') : null),
      clockDisplay: clockEl ? getComputedStyle(clockEl).display : 'missing',
    };
  }, SEL(202));
  const gapTimer = hTimer.clock && hTimer.pin ? hTimer.pin.x - hTimer.clock.right : null;
  ok(hTimer.clockDisplay !== 'none' && gapTimer !== null && gapTimer >= 0 && gapTimer <= 12,
    `изключена настройка: часовникът и пинът са един до друг при напомняне (${gapTimer}px)`, hTimer);

  // Иконата на календара стои ВЪТРЕ в .note-header-date, който носи клик-слушателя.
  // В cx-notes `debug` е винаги true, затова кликът на датата показва суровите данни
  // вместо мини календара (предсъществуващо, не е част от тази поправка) - затова тук
  // се проверява, че иконата е в кликаемия елемент, а не какво отваря кликът.
  const hClick = await page.evaluate((sel) => {
    const note = document.querySelector(sel);
    const calIcon = note ? note.querySelector('.note-header-calendar-icon') : null;
    const dateEl = note ? note.querySelector('.note-header-date') : null;
    return {
      inside: !!(calIcon && dateEl && calIcon.closest('.note-header-date') === dateEl),
      pointerEvents: dateEl ? getComputedStyle(dateEl).pointerEvents : null,
    };
  }, SEL(201));
  ok(hClick.inside, 'изключена настройка: иконата на календара е в кликаемия елемент на датата', hClick);
  ok(hClick.pointerEvents === 'auto', `изключена настройка: датата приема кликове (${hClick.pointerEvents})`, hClick);

  // Клик на иконата на часовника показва аналоговия часовник.
  await page.click(`${SEL(201)} .note-header-clock-icon`).catch(() => { });
  await page.waitForSelector(`${SEL(201)} .clock`, { timeout: 3000 }).catch(() => { });
  ok(await page.evaluate((sel) => !!document.querySelector(sel + ' .clock'), SEL(201)),
    'изключена настройка: клик на иконата на часовника показва аналоговия часовник', null);

  ok(errs.length === 0, `изключена настройка: няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`, errs);
  await ctx.close();
}

// ---- 2. Настройката е ВКЛЮЧЕНА: текст, без дублирани икони ----
{
  const { ctx, page, errs } = await boot(false);
  const h = await page.evaluate((sel) => {
    const note = document.querySelector(sel);
    if (!note) return { missingNote: true };
    const dateText = note.querySelector('.note-header-date-text');
    const timeText = note.querySelector('.note-header-time-text');
    const calIcon = note.querySelector('.note-header-calendar-icon');
    const clockIcon = note.querySelector('.note-header-clock-icon');
    return {
      bodyClass: document.body.classList.contains('hide-datemod'),
      dateTextDisplay: dateText ? getComputedStyle(dateText).display : null,
      timeTextDisplay: timeText ? getComputedStyle(timeText).display : null,
      dateTextValue: dateText ? dateText.textContent.trim() : null,
      timeTextValue: timeText ? timeText.textContent.trim() : null,
      calDisplay: calIcon ? getComputedStyle(calIcon).display : null,
      clockDisplay: clockIcon ? getComputedStyle(clockIcon).display : null,
      pinVisible: !!note.querySelector('.note-pin-btn'),
    };
  }, SEL(201));
  ok(h.bodyClass === false, 'включена настройка: body не носи .hide-datemod', h);
  ok(h.dateTextDisplay !== 'none' && h.dateTextValue !== '', `включена настройка: датата се вижда като текст (${h.dateTextDisplay}, ${JSON.stringify(h.dateTextValue)})`, h);
  ok(h.timeTextDisplay === 'none' || h.timeTextValue === '', `включена настройка: при бележка само с дата няма измислен час (${JSON.stringify(h.timeTextValue)})`, h);
  ok(h.calDisplay !== 'none', `включена настройка: иконата на календара е пред датата (${h.calDisplay})`, h);
  ok(h.pinVisible === true, 'включена настройка: пин-бутонът е наличен', h);

  const h2 = await page.evaluate((sel) => {
    const note = document.querySelector(sel);
    if (!note) return { missingNote: true };
    const dateText = note.querySelector('.note-header-date-text');
    const timeText = note.querySelector('.note-header-time-text');
    const calIcon = note.querySelector('.note-header-calendar-icon');
    const clockIcon = note.querySelector('.note-header-clock-icon');
    return {
      date: dateText ? dateText.textContent.trim() : null,
      time: timeText ? timeText.textContent.trim() : null,
      calDisplay: calIcon ? getComputedStyle(calIcon).display : null,
      clockDisplay: clockIcon ? getComputedStyle(clockIcon).display : null,
    };
  }, SEL(202));
  ok(!!h2.date && !!h2.time, `включена настройка (напомняне): дата и час от timer (${JSON.stringify(h2.date)}, ${JSON.stringify(h2.time)})`, h2);
  // Часовникът се вижда при наличен час; иконата на календара в нормалния хедър се показва
  // само когато бележката има и календарна дата (както е било и преди промяната).
  ok(h2.clockDisplay !== 'none', `включена настройка (напомняне): иконата на часовника се вижда (${h2.clockDisplay})`, h2);

  ok(errs.length === 0, `включена настройка: няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`, errs);
  await ctx.close();
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
