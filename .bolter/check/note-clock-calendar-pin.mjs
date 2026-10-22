// Часовник, седмичен мини календар и закачане на бележка (порт от клон cx-notes).
// Проверява върху истинската страница uni/index-2.html + uni/main.js:
//   - клик на часа (.note-header-time) слага аналогов часовник в бележката: циферблат,
//     4 цифри, 8 чертички, три стрелки; секундарникът върви; втори клик върху циферблата
//     връща оригиналния текст и скрива показаното заглавие. Часовникът работи и върху
//     бележка с текст (съзнателно решение от плана, както е в cx-notes).
//   - клик на датата (.note-header-date) отваря седмичния мини календар В бележката:
//     заглавие от 7 дни, 7 реда по ден, днешният ден е .is-today, ‹ и › сменят седмицата,
//     бутончето с иконата връща текущата седмица, × затваря; маркер има само за бележки
//     с calendarDate в седмицата и status !== 1, а кликът му отваря бележката в модала.
//   - бутонче за закачане: кликът дава .note-pinned, закачената застава преди незакачената
//     в #notes-container, подсказката идва от езиковите ключове, записът отива в IndexedDB
//     и закачането оцелява след презареждане на страницата.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/note-clock-calendar-pin.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Приложението е index-2.html (то зарежда main.js); index.html е само splash.
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel.endsWith('mainn.js') ? rel.slice(0, -'mainn.js'.length) + 'main.js' : rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

// Очакваните низове идват от самите езикови файлове, не от спомен: страницата се пуска на bg.
const bg = JSON.parse(await readFile(path.join(root, 'lang/i18n-bg.json'), 'utf8'));
const pinOn = bg.pinNoteTooltip, pinOff = bg.unpinNoteTooltip;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 500) : ''));
  if (!cond) fails++;
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });

// Езикът се фиксира преди зареждането: проверката сравнява с i18n-bg.json.
await ctx.addInitScript(() => { try { localStorage.setItem('language', 'bg'); } catch (e) { } });

// gapi се замества В СТРАНИЦАТА: приложението пита Drive през gapi, не през fetch.
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

// Всичко външно се отговаря на място: проверката не излиза в мрежата.
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
// Тънък таван за всяко чакане: липсващ елемент се отчита като FAIL веднага, вместо да
// виси 30 секунди на всеки клик (на базата липсват и трите поведения).
page.setDefaultTimeout(4000);
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

const SEL = (id) => `#notes-container .note[data-i="${id}"]`;
// Клик, който не срива проверката, ако елементът още го няма: липсата се хваща от ok().
const click = async (sel, opts) => { try { await page.click(sel, { timeout: 4000, ...(opts || {}) }); return true; } catch (e) { return false; } };
// Закачането е асинхронно (пре-рендер + запис в IndexedDB). Краят му се вижда по съобщението,
// не по класа: класът се появява с новия елемент, а записът и подреждането идват след него.
const waitToast = (msg) => page.waitForFunction((m) =>
  ((document.getElementById('toastNotification') || {}).textContent || '') === m, msg, { timeout: 6000 })
  .then(() => true).catch(() => false);
const N1 = 101, N2 = 102, N3 = 103, N4 = 104;

// Бележките и бордът, както ги прави приложението: истински обекти в паметта и в IndexedDB,
// после истинският createNoteElement + applyFilters.
const SETUP = `(async () => {
  window.__opened = [];
  localStorage.setItem('hideAssistant', 'true');
  localStorage.setItem('notesBgrd', 'false');
  localStorage.removeItem('sortCriteria');
  localStorage.removeItem('sortInReverse');
  localStorage.removeItem('sortRemindersTop');
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
    mk(101, 'първа бележка', 2, 0),                              // нея закачаме (по подредба е втора)
    mk(102, 'втора бележка', 1, 3),
    mk(103, 'среща днес', 3, 4, { calendarDate: today0.getTime() + 3600000 * 10 }), // маркер за днес
    mk(104, 'изтрита със същата дата', 4, 5, { calendarDate: today0.getTime() + 3600000 * 11, status: 1 }),
  ];
  allNotesData = notes;
  notesContainer.innerHTML = '';
  const els = await Promise.all(notes.map(nt => createNoteElement(nt)));
  els.forEach(el => { if (el) notesContainer.appendChild(el); });
  applyFilters();
  await bulkPutDB(NOTE_STORE_NAME, notes, true); // бележките в истинската IndexedDB
  return {
    order: [...notesContainer.querySelectorAll('.note:not(.promo-note)')].map(el => el.dataset.i),
    visible: [...notesContainer.querySelectorAll('.note:not(.promo-note)')].filter(el => el.style.display !== 'none').map(el => el.dataset.i),
    today: { day: today0.getDate(), dow: (today0.getDay() + 6) % 7, time: today0.getTime() },
    palette: noteColorMap[4],
  };
})()`;

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
// Готовност само по онова, което съществува и на базата: иначе проверката пада още на
// изчакването, вместо на самите поведения. Липсите се отчитат като FAIL по-долу.
await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof applyFilters === 'function'
  && typeof getAllFromDB === 'function', null, { timeout: 20000 });

const api = await page.evaluate(() => ({
  weekCalendar: typeof showNoteWeekCalendar, pin: typeof toggleNotePinned,
  colorCss: typeof getNoteColorCss, headerTs: typeof getNoteHeaderDateTimestamp,
}));
ok(api.weekCalendar === 'function', `има showNoteWeekCalendar (${api.weekCalendar})`, api);
ok(api.pin === 'function', `има toggleNotePinned (${api.pin})`, api);
ok(api.colorCss === 'function', `има getNoteColorCss (${api.colorCss})`, api);
ok(api.headerTs === 'function', `има getNoteHeaderDateTimestamp (${api.headerTs})`, api);
ok(bg.pinNoteTooltip && bg.unpinNoteTooltip && bg.notePinned && bg.noteUnpinned
  && bg.weeklyCalendar && bg.previousWeek && bg.nextWeek && bg.today,
  'осемте нови езикови ключа съществуват в i18n-bg.json', Object.keys(bg).filter(k => /pin|Pin|week|Week|today|Today/.test(k)));

const boot = await page.evaluate(SETUP);
ok(boot.visible.join(',') === '102,101,103', `бордът е подреден по numord преди закачане (видими ${boot.visible.join(',')})`, boot);
ok(boot.visible.includes('104') === false, `изтритата бележка (status 1) не се вижда на борда (${boot.visible.join(',')})`, boot);

// ======================= 1. Часовник при клик на часа =======================
const beforeClock = await page.evaluate((sel) => {
  const note = document.querySelector(sel);
  const content = note.querySelector('.note-content');
  return {
    html: content.innerHTML,
    text: content.textContent,
    timeText: note.querySelector('.note-header-time').textContent.trim(),
    open: getOpenNoteWindows().length,
    titleDisplay: getComputedStyle(note.querySelector('.note-content-wrapper > div')).display,
  };
}, SEL(N1));
ok(beforeClock.text.includes('първа бележка'), `часовник: бележката има текст преди клика (${JSON.stringify(beforeClock.text)})`, beforeClock);
ok(beforeClock.timeText !== '', `часовник: часът се вижда в хедъра (${JSON.stringify(beforeClock.timeText)})`, beforeClock);

ok(await click(`${SEL(N1)} .note-header-time`), 'часовник: часът в хедъра се натиска', null);
await page.waitForSelector(`${SEL(N1)} .clock`, { timeout: 3000 }).catch(() => { });
const clock = await page.evaluate((sel) => {
  const note = document.querySelector(sel);
  const c = note.querySelector('.clock');
  if (!c) return { found: false };
  const hand = (cls) => {
    const el = c.querySelector(cls);
    if (!el) return null;
    // Размерът се чете от CSS: ограничаващата кутия на завъртяна ръка не е дължината ѝ.
    const cs = getComputedStyle(el);
    return { w: Math.round(parseFloat(cs.width)), h: Math.round(parseFloat(cs.height)), transform: el.style.transform };
  };
  const now = new Date();
  return {
    found: true,
    inNote: true,
    hour: hand('.hand.hour'), minute: hand('.hand.minute'), second: hand('.hand.second'),
    numbers: c.querySelectorAll('.number').length,
    marks: c.querySelectorAll('.mark').length,
    centered: getComputedStyle(note.querySelector('.note-content')).display,
    titleDisplay: getComputedStyle(note.querySelector('.note-content-wrapper > div')).display,
    open: getOpenNoteWindows().length,
    nowDeg: { s: now.getSeconds() * 6, m: now.getMinutes() * 6 + now.getSeconds() * 0.1, h: (now.getHours() % 12) * 30 + now.getMinutes() * 0.5 },
  };
}, SEL(N1));
ok(clock.found === true, 'часовник: кликът на часа показва .clock в бележката', clock);
ok(!!clock.hour && !!clock.minute && !!clock.second, 'часовник: има hour, minute и second ръка', clock);
ok(clock.numbers === 4 && clock.marks === 8, `часовник: 4 цифри и 8 чертички (${clock.numbers}, ${clock.marks})`, clock);
const h = (x) => (x && x.h) || 0, w = (x) => (x && x.w) || 0;
ok(h(clock.hour) > 0 && h(clock.minute) > h(clock.hour) && h(clock.second) > h(clock.minute),
  `часовник: трите ръце имат дължини, часовата е най-къса (${h(clock.hour)} < ${h(clock.minute)} < ${h(clock.second)})`, clock);
ok(w(clock.hour) > w(clock.minute) && w(clock.minute) > w(clock.second),
  `часовник: часовата ръка е най-дебела (${w(clock.hour)} > ${w(clock.minute)} > ${w(clock.second)})`, clock);
ok(clock.open === 0, `часовник: кликът на часа не отваря бележката в модал (${clock.open})`, clock);
ok(clock.titleDisplay === 'none', `часовник: заглавният ред се скрива, за да има място (${clock.titleDisplay})`, clock);
// Стрелките показват истинския час: сравняваме ъгъла с ъгъла от часовника на машината.
const deg = (t) => { const m = /rotate\(([-\d.]+)deg\)/.exec(t || ''); return m ? ((parseFloat(m[1]) % 360) + 360) % 360 : 0; };
const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const degOf = (x) => deg((x || {}).transform);
const nd = clock.nowDeg || { s: 0, m: 0, h: 0 };
ok(clock.found && diff(degOf(clock.second), nd.s) <= 12
  && diff(degOf(clock.minute), nd.m) <= 12
  && diff(degOf(clock.hour), nd.h) <= 12,
  `часовник: стрелките сочат истинския час (${degOf(clock.second)}~${nd.s}, ${degOf(clock.minute)}~${nd.m}, ${degOf(clock.hour)}~${nd.h})`, clock);

const firstSecond = (clock.second || {}).transform;
const secondAfter = await page.waitForFunction(({ sel, first }) => {
  const s = document.querySelector(sel + ' .clock .second');
  if (!s || !s.style.transform || s.style.transform === first) return false;
  return s.style.transform;
}, { sel: SEL(N1), first: firstSecond }, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => null);
ok(secondAfter !== null && secondAfter !== firstSecond,
  `часовник: секундарникът върви сам (${firstSecond} -> ${secondAfter})`, { firstSecond, secondAfter });

ok(await click(`${SEL(N1)} .clock`), 'часовник: циферблатът се натиска', null);
await page.waitForFunction((sel) => !document.querySelector(sel + ' .clock'), SEL(N1), { timeout: 3000 }).catch(() => { });
const afterClock = await page.evaluate((sel) => {
  const note = document.querySelector(sel);
  const content = note.querySelector('.note-content');
  return {
    hasClock: !!note.querySelector('.clock'),
    text: content.textContent,
    titleDisplay: getComputedStyle(note.querySelector('.note-content-wrapper > div')).display,
    display: content.style.display, open: getOpenNoteWindows().length,
  };
}, SEL(N1));
ok(afterClock.hasClock === false, 'часовник: втори клик върху циферблата маха .clock', afterClock);
ok(afterClock.text === beforeClock.text, `часовник: оригиналният текст се връща (${JSON.stringify(afterClock.text)})`, afterClock);
ok(afterClock.text.includes('първа бележка'), 'часовник: върнатият текст е същият, който беше в бележката', afterClock);
ok(afterClock.titleDisplay !== 'none' && afterClock.display === '',
  `часовник: заглавният ред се показва пак (${afterClock.titleDisplay}, ${afterClock.display})`, afterClock);
ok(afterClock.open === 0, `часовник: затварянето не отваря модала (${afterClock.open})`, afterClock);

// ======================= 2. Седмичен мини календар при клик на датата =======================
const readCal = (id) => page.evaluate((sel) => {
  const note = document.querySelector(sel);
  const cal = note.querySelector('.note-week-calendar');
  if (!cal) return { found: false, labels: [], classes: [], markers: [], navs: [], todayIndex: -1, selectedIndex: -1 };
  const days = [...cal.querySelectorAll('.note-week-day')];
  return {
    found: true, inNote: true, inBody: !!document.body.querySelector(':scope > .note-week-calendar'),
    role: cal.getAttribute('role'), aria: cal.getAttribute('aria-label'),
    title: (cal.querySelector('.note-week-title') || {}).textContent,
    navs: [...cal.querySelectorAll('.note-week-nav')].map(b => b.textContent),
    hasTodayBtn: !!cal.querySelector('.note-week-today svg'),
    hasClose: !!cal.querySelector('.note-week-close-hint'),
    rows: days.length,
    labels: days.map(d => (d.querySelector('.note-week-date-label') || {}).textContent),
    classes: days.map(d => d.className),
    todayIndex: days.findIndex(d => d.classList.contains('is-today')),
    selectedIndex: days.findIndex(d => d.classList.contains('is-selected')),
    markers: [...cal.querySelectorAll('.note-week-marker')].map(m => ({
      row: days.indexOf(m.closest('.note-week-day')), bg: getComputedStyle(m).backgroundColor,
      title: m.getAttribute('title'), aria: m.getAttribute('aria-label'),
    })),
    open: getOpenNoteWindows().length,
  };
}, SEL(id));

ok(boot.visible.includes('101'), 'календар: бележката, по която кликаме датата, е на борда', boot);
ok(await click(`${SEL(N1)} .note-header-date`), 'календар: датата в хедъра се натиска', null);
await page.waitForSelector(`${SEL(N1)} .note-week-calendar`, { timeout: 3000 }).catch(() => { });
const cal = await readCal(N1);
ok(cal.found === true, 'календар: кликът на датата отваря .note-week-calendar', cal);
ok(cal.inNote === true && cal.inBody === false, 'календар: календарът е вътре в бележката, не в body', cal);
ok(cal.role === 'dialog' && cal.aria === bg.weeklyCalendar,
  `календар: aria-label идва от i18n ключа (${JSON.stringify(cal.aria)} ~ ${JSON.stringify(bg.weeklyCalendar)})`, cal);
ok(cal.rows === 7 && cal.classes.every(c => c.split(' ').includes('note-week-day')),
  `календар: 7 реда .note-week-day (${cal.rows})`, cal.labels);
const weekRange = /^(\d{2})\.(\d{2})\.(\d{4}) – (\d{2})\.(\d{2})\.(\d{4})$/.exec(cal.title || '');
ok(!!weekRange, `календар: заглавието е диапазон от 7 дни (${JSON.stringify(cal.title)})`, cal);
if (weekRange) {
  const from = new Date(+weekRange[3], +weekRange[2] - 1, +weekRange[1]);
  const to = new Date(+weekRange[6], +weekRange[5] - 1, +weekRange[4]);
  const span = Math.round((to - from) / 86400000);
  ok(span === 6, `календар: диапазонът е точно 7 дни (${span + 1} дни, ${cal.title})`, cal);
  ok(from.getDay() === 1, `календар: седмицата започва в понеделник (${from.toDateString()})`, cal);
  const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
  ok(todayMid >= from && todayMid <= to, `календар: отворена е седмицата на днешния ден (${cal.title})`, cal);
  const expectedFirst = String(from.getDate()).padStart(2, '0') + '.';
  ok((cal.labels[0] || '').startsWith(expectedFirst),
    `календар: първият ред е ${from.getDate()} (${cal.labels[0]})`, cal.labels);
}
ok(cal.todayIndex === boot.today.dow, `календар: днешният ден е на мястото си (${cal.todayIndex} ~ ${boot.today.dow})`, cal.classes);
ok((cal.labels[cal.todayIndex] || '').startsWith(String(boot.today.day).padStart(2, '0') + '.'),
  `календар: .is-today е на днешната дата (${cal.labels[cal.todayIndex]})`, cal);
ok(cal.selectedIndex >= 0, `календар: бележката отбелязва деня си (.is-selected на ред ${cal.selectedIndex})`, cal.classes);
ok(cal.navs.length === 2 && cal.navs[0] === '‹' && cal.navs[1] === '›' && cal.hasTodayBtn && cal.hasClose,
  `календар: има ‹ ›, бутонче за днес и × (${JSON.stringify(cal.navs)})`, cal);
ok(cal.markers.length === 1, `календар: само бележката с calendarDate и status 0 дава маркер (${cal.markers.length})`, cal.markers);
ok(cal.markers[0] && cal.markers[0].row === cal.todayIndex,
  `календар: маркерът е на днешния ред (ред ${cal.markers[0] && cal.markers[0].row})`, cal.markers);
ok(cal.markers[0] && cal.markers[0].bg === 'rgb(105, 183, 255)',
  `календар: маркерът носи цвета на бележката (${cal.markers[0] && cal.markers[0].bg} ~ ${boot.palette})`, cal.markers);
ok(cal.markers[0] && cal.markers[0].title === 'среща днес',
  `календар: подсказката на маркера е първият ред на бележката (${cal.markers[0] && cal.markers[0].title})`, cal.markers);
ok(cal.open === 0, `календар: отварянето на календара не отваря бележката (${cal.open})`, cal);

// Debug клонът остава: Ctrl+клик показва суровите данни вместо календара. Проверява се на
// втората бележка, защото отвореният календар ляга върху датата на първата.
await page.keyboard.down('Control');
await page.click(`${SEL(N2)} .note-header-date`);
await page.keyboard.up('Control');
const dbgModal = await page.waitForFunction(() => {
  const w = getOpenNoteWindows();
  return w.length === 1 ? w[0].body.innerText : false;
}, null, { timeout: 4000 }).then(t => String(t)).catch(() => '');
ok(dbgModal.includes('GN102') && dbgModal.includes('"notetxt"'),
  `календар: в debug режим Ctrl+клик показва суровите данни, не календара (${JSON.stringify(dbgModal.slice(0, 60))})`, dbgModal.slice(0, 200));
ok(await page.evaluate((sel) => !document.querySelector(sel + ' .note-week-calendar'), SEL(N2)),
  'календар: Ctrl+клик не отваря календара (debug клонът е непокътнат)', null);
await page.evaluate(() => getOpenNoteWindows().forEach(w => { const x = w.el.querySelector('.modal-close'); if (x) x.click(); }));
await page.waitForFunction(() => getOpenNoteWindows().length === 0, null, { timeout: 3000 }).catch(() => { });
ok((await readCal(N1)).found === true, 'календар: проверката на debug клона не маха вече отворения календар',
  await readCal(N1));

// ‹ и › сменят седмицата, бутончето с иконата връща текущата.
const titleNow = cal.title;
await click(`${SEL(N1)} .note-week-calendar .note-week-nav`);
const prev = await readCal(N1);
const prevRange = /^(\d{2})\.(\d{2})\.(\d{4}) – (\d{2})\.(\d{2})\.(\d{4})$/.exec(prev.title || '');
const prevFrom = prevRange ? new Date(+prevRange[3], +prevRange[2] - 1, +prevRange[1]) : null;
ok(prev.rows === 7 && prev.title !== titleNow && prev.todayIndex === -1,
  `календар: „‹" показва предишната седмица (${prev.title}, 7 дни: ${prev.rows}, днес: ${prev.todayIndex})`, prev);
if (weekRange && prevFrom) {
  const from = new Date(+weekRange[3], +weekRange[2] - 1, +weekRange[1]);
  ok(Math.round((from - prevFrom) / 86400000) === 7, `календар: „‹" връща точно 7 дни назад (${prev.title})`, { now: titleNow, prev: prev.title });
}
await click(`${SEL(N1)} .note-week-calendar .note-week-nav:last-of-type`);
const back = await readCal(N1);
ok(back.title === titleNow, `календар: „›" връща същата седмица (${back.title})`, { was: titleNow, now: back.title });
await click(`${SEL(N1)} .note-week-calendar .note-week-nav`);
await click(`${SEL(N1)} .note-week-calendar .note-week-nav`);
const earlier = await readCal(N1);
ok(earlier.title !== titleNow, `календар: две стъпки назад далеч от текущата седмица (${earlier.title})`, earlier);
await click(`${SEL(N1)} .note-week-calendar .note-week-today`);
const home = await readCal(N1);
ok(home.title === titleNow && home.todayIndex === boot.today.dow,
  `календар: бутончето с иконата връща текущата седмица (${home.title}, днес на ред ${home.todayIndex})`, home);

// Маркерът отваря бележката в модала.
await click(`${SEL(N1)} .note-week-calendar .note-week-marker`);
const opened = await page.waitForFunction(() => {
  const w = getOpenNoteWindows();
  return w.length === 1 ? w[0].body.innerText : false;
}, null, { timeout: 5000 }).then(t => String(t)).catch(() => '');
ok(opened.includes('среща днес'), `календар: кликът на маркера отваря бележката в модала (${JSON.stringify(opened.slice(0, 60))})`, opened);
// Хиксчето на модала може да е скрито до посочване: първо истински клик, иначе клик в страницата.
await page.click('#content-modal .modal-close', { timeout: 2000 }).catch(() => { });
await page.waitForFunction(() => getOpenNoteWindows().length === 0, null, { timeout: 2000 }).catch(async () => {
  await page.evaluate(() => getOpenNoteWindows().forEach(w => {
    const x = w.el.querySelector('.modal-close');
    if (x) x.click();
  }));
});
ok(await page.evaluate(() => getOpenNoteWindows().length === 0), 'календар: модалът се затваря след проверката на маркера',
  await page.evaluate(() => getOpenNoteWindows().length));

// × затваря календара; втори клик на датата също.
await click(`${SEL(N1)} .note-week-calendar .note-week-close-hint`);
await page.waitForFunction((sel) => !document.querySelector(sel + ' .note-week-calendar'), SEL(N1), { timeout: 3000 }).catch(() => { });
ok((await readCal(N1)).found === false, 'календар: × затваря календара', await readCal(N1));
// Календарът ляга върху цялата бележка, затова го затваря клик по собствената му лента
// (извън стрелките и бутончето за днес), точно както е в cx-notes.
await click(`${SEL(N1)} .note-header-date`);
await page.waitForSelector(`${SEL(N1)} .note-week-calendar`, { timeout: 3000 }).catch(() => { });
await click(`${SEL(N1)} .note-week-calendar .note-week-title`);
await page.waitForFunction((sel) => !document.querySelector(sel + ' .note-week-calendar'), SEL(N1), { timeout: 3000 }).catch(() => { });
const toggled = await page.evaluate((sel) => getOpenNoteWindows().length + ':' + !document.querySelector(sel + ' .note-week-calendar'), SEL(N1));
ok(toggled === '0:true', `календар: клик по лентата му го затваря, без да отваря бележката (${toggled})`, toggled);

// ======================= 3. Закачане на бележка =======================
const readPins = () => page.evaluate((ids) => {
  const out = {};
  ids.forEach(id => {
    const note = document.querySelector(`#notes-container .note[data-i="${id}"]`);
    if (!note) { out[id] = null; return; }
    const btn = note.querySelector('.note-pin-btn');
    out[id] = {
      btn: !!btn,
      title: btn ? btn.title : null, aria: btn ? btn.getAttribute('aria-label') : null,
      btnPinned: btn ? btn.classList.contains('pinned') : null,
      dotFill: btn && btn.querySelector('.pin-dot') ? getComputedStyle(btn.querySelector('.pin-dot')).fill : null,
      notePinned: note.classList.contains('note-pinned'),
      outline: getComputedStyle(note).boxShadow.slice(0, 40),
      pin: note.dataset.pin,
      // Разстоянието от пин-бутона до десния ръб на бележката: 26px (отстъпът на хедъра е 25px).
      pinGap: btn ? Math.round(note.getBoundingClientRect().right - btn.getBoundingClientRect().right) : null,
    };
  });
  out.order = [...document.querySelectorAll('#notes-container .note:not(.promo-note)')]
    .filter(n => n.style.display !== 'none').map(n => n.dataset.i);
  out.toast = (document.getElementById('toastNotification') || {}).textContent;
  out.open = getOpenNoteWindows().length;
  return out;
}, [String(N1), String(N2)]);

const pins0 = await readPins();
ok(!!pins0[N1].btn && !!pins0[N2].btn, 'pin: всяка бележка има бутонче в хедъра', pins0);
ok(pins0[N1].title === pinOn && pins0[N1].aria === pinOn,
  `pin: подсказката е от i18n ключа (${JSON.stringify(pins0[N1].title)} ~ ${JSON.stringify(pinOn)})`, pins0[N1]);
ok(pins0[N1].title !== 'pinNoteTooltip', 'pin: подсказката не е името на ключа, а преводът', pins0[N1]);
ok(pins0[N2].notePinned === false && pins0[N1].notePinned === false, 'pin: никоя бележка не е закачена в началото', pins0);
ok(pins0.order.join(',') === '102,101,103', `pin: преди закачане редът е по numord (${pins0.order.join(',')})`, pins0);
ok(pins0[N1].pinGap === 26, `pin: бутончето е на 26px от десния ръб на бележката (${pins0[N1].pinGap})`, pins0[N1]);

await click(`${SEL(N1)} .note-pin-btn`);
ok(await waitToast(bg.notePinned), 'pin: закачането завършва и показва съобщение', await page.evaluate(() => (document.getElementById('toastNotification') || {}).textContent));
const pins1 = await readPins();
ok(pins1[N1].notePinned === true, 'pin: кликът дава .note-pinned на бележката', pins1[N1]);
ok(pins1[N1].btnPinned === true && pins1[N1].dotFill !== 'none' && pins1[N1].dotFill !== 'rgba(0, 0, 0, 0)',
  `pin: бутончето е отбелязано и точката се пълни (${pins1[N1].btnPinned}, ${pins1[N1].dotFill})`, pins1[N1]);
ok(pins1[N2].notePinned === false, 'pin: другата бележка остава незакачена', pins1[N2]);
ok(pins1[N1].title === pinOff && pins1[N1].aria === pinOff,
  `pin: подсказката се сменя на „откачи" (${JSON.stringify(pins1[N1].title)} ~ ${JSON.stringify(pinOff)})`, pins1[N1]);
ok(pins1.order.join(',') === '101,102,103',
  `pin: закачената застава преди незакачените в #notes-container (${pins1.order.join(',')})`, pins1);
ok(Number(pins1[N1].pin) > 0, `pin: бележката носи data-pin с момента на закачане (${pins1[N1].pin})`, pins1[N1]);
ok(pins1.toast === bg.notePinned, `pin: съобщението е от i18n ключа (${JSON.stringify(pins1.toast)} ~ ${JSON.stringify(bg.notePinned)})`, pins1.toast);
ok(pins1.open === 0, `pin: кликът на бутончето не отваря бележката в модала (${pins1.open})`, pins1.open);

// Записът отива в IndexedDB: версията се вдига, pinnedAt се слага.
const stored1 = await page.evaluate(async () => {
  const rows = await getAllFromDB(NOTE_STORE_NAME);
  const r = rows.find(x => x.id === 101);
  return r ? { version: r.version, pinnedAt: r.pinnedAt || 0, datemod: r.datemod } : null;
});
ok(stored1 && Number(stored1.pinnedAt) > 0, `pin: закачането се записва в IndexedDB (pinnedAt ${stored1 && stored1.pinnedAt})`, stored1);
ok(stored1 && Number(stored1.version) > 1, `pin: версията на записа се вдига (${stored1 && stored1.version})`, stored1);

// Закачането оцелява след презареждане на страницата.
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof getAllFromDB === 'function', null, { timeout: 20000 });
const afterReload = await page.evaluate(async () => {
  const rows = await getAllFromDB(NOTE_STORE_NAME);
  const pinned = rows.find(x => x.id === 101);
  localStorage.setItem('hideAssistant', 'true');
  notesContainer = document.getElementById('notes-container');
  searchBox = document.getElementById('search-box');
  if (!boardsData.some(b => b.gdid === 'B1')) boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' });
  currentBoardFilter = 'all';
  allNotesData = rows;
  notesContainer.innerHTML = '';
  const els = await Promise.all(rows.filter(r => r.status !== 1).map(r => createNoteElement(r)));
  els.forEach(el => { if (el) notesContainer.appendChild(el); });
  applyFilters();
  const note = document.querySelector('#notes-container .note[data-i="101"]');
  const btn = note ? note.querySelector('.note-pin-btn') : null;
  return {
    pinnedAt: pinned ? (pinned.pinnedAt || 0) : 0,
    inDb: rows.length,
    pinned: !!note && note.classList.contains('note-pinned'),
    btnPinned: !!btn && btn.classList.contains('pinned'),
    aria: btn ? btn.getAttribute('aria-label') : null, title: btn ? btn.title : null,
    order: [...document.querySelectorAll('#notes-container .note:not(.promo-note)')]
      .filter(n => n.style.display !== 'none').map(n => n.dataset.i),
  };
});
ok(afterReload.pinnedAt > 0, `pin: след презареждане записът в IndexedDB още е закачен (pinnedAt ${afterReload.pinnedAt})`, afterReload);
ok(afterReload.pinned === true && afterReload.btnPinned === true,
  `pin: пресъздадената карта идва закачена (${afterReload.pinned}, ${afterReload.btnPinned})`, afterReload);
ok(afterReload.aria === pinOff, `pin: подсказката след презареждане казва „откачи" (${JSON.stringify(afterReload.aria)})`, afterReload);
ok(afterReload.order[0] === '101',
  `pin: редът на борда след презареждане е със закачената най-отпред (${afterReload.order.join(',')})`, afterReload);

// Втори клик откача: контурът пада, редът се връща по сортирането.
await click(`${SEL(N1)} .note-pin-btn`);
ok(await waitToast(bg.noteUnpinned), 'pin: откачането завършва и показва съобщение', await page.evaluate(() => (document.getElementById('toastNotification') || {}).textContent));
const pins2 = await readPins();
ok(pins2[N1].notePinned === false && pins2[N1].btnPinned === false,
  `pin: втори клик маха контура на бележката (${pins2[N1].notePinned}, ${pins2[N1].btnPinned})`, pins2[N1]);
ok(pins2[N1].title === pinOn, `pin: подсказката се връща на „закачи" (${JSON.stringify(pins2[N1].title)})`, pins2[N1]);
ok(pins2.order.join(',') === '102,101,103',
  `pin: редът се връща по избраното сортиране (${pins2.order.join(',')})`, pins2);
ok(pins2.toast === bg.noteUnpinned, `pin: съобщението за откачане е от i18n (${JSON.stringify(pins2.toast)})`, pins2.toast);
const stored2 = await page.evaluate(async () => {
  const rows = await getAllFromDB(NOTE_STORE_NAME);
  const r = rows.find(x => x.id === 101);
  return r ? { version: r.version, pinnedAt: r.pinnedAt || 0 } : null;
});
ok(stored2 && !stored2.pinnedAt && Number(stored2.version) > Number(stored1.version),
  `pin: откачането също се записва (pinnedAt ${stored2 && stored2.pinnedAt}, версия ${stored2 && stored2.version} > ${stored1.version})`, stored2);

// ======================= 4. Никакви грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`, errs);

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
