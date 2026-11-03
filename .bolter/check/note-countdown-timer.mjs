// Таймер върху циферблата на бележка (клон cx-notes, b3.59).
// Проверява върху истинската страница uni/index.html + uni/main.js:
//   - Ctrl-клик върху циферблата отваря избор на минути и НЕ затваря часовника;
//   - дълго натискане (телефон) прави същото, а обикновеният клик затваря часовника както преди;
//   - изборът има два режима: „Таймер“ (минути) и „Аларма“ (точен час от деня);
//   - избраните минути пускат обратно броене, което седи над числото 6 и се обновява на 15 сек;
//   - алармата показва само насрочения час и 15-секундният такт не я превръща в броене;
//   - при изтичане се пуска кратък beep (осцилатор в AudioContext) и до времето застава камбанка;
//   - „Стоп“ маха таймера/алармата, а при ново отваряне на часовника бележката помни пуснатото
//     и изборът се отваря в режима, който бележката ползва.
// Пуска се от корена на хранилището (SeeNotes):
//   node .bolter/check/note-countdown-timer.mjs      (exit 1 при провалена проверка)
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

const browser = await chromium.launch({ args: ['--num-raster-threads=4', '--autoplay-policy=no-user-gesture-required'] });

// b3.61: часът на алармата вече следва настройката на системата (24/12), затова проверката тук е
// закована към българска система — 12-часовият вид се проверява в note-timer-panel-and-sound.mjs.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'bg-BG' });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
    localStorage.setItem('notesBgrd', 'false');
  } catch (e) { }
});
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
  // Брояч на осцилаторите: така beep-ът се проверява без да се пипа звукът на машината.
  window.__osc = 0;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx) {
    const orig = Ctx.prototype.createOscillator;
    Ctx.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
  }
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
page.setDefaultTimeout(5000);
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
  const mk = (id, txt) => ({
    alarm_type: -1, boardid: 'B1', calendarDate: 0, color: 0, date: now - 60000, datemod: now - 30000,
    eventId: 0, gdid: 'GN' + id, id, notetxt: txt, numord: id, sellist: 0, status: 0,
    text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1,
  });
  const notes = [mk(201, 'бележка с таймер'), mk(202, 'втора бележка')];
  allNotesData = notes;
  notesContainer.innerHTML = '';
  const els = await Promise.all(notes.map(nt => createNoteElement(nt)));
  els.forEach(el => { if (el) notesContainer.appendChild(el); });
  applyFilters();
})()`);
await page.waitForTimeout(400);

const note202 = '#notes-container .note[data-i="202"]';
const dial1 = '#clock-201';
const dial2 = '#clock-202';

// Отваря часовника на бележка 201 с клик върху часа в хедъра.
await page.click('#notes-container .note[data-i="201"] .note-header-time');
await page.waitForSelector(dial1, { timeout: 5000 });
const opened = await page.evaluate((sel) => !!document.querySelector(sel + ' .center'), dial1);
ok(opened, 'часовникът се отваря в бележката', opened);

// 1: преди таймер редът с остатъка е скрит.
let r = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  if (!el) return { missing: true };
  return { hidden: el.hidden, display: getComputedStyle(el).display, text: el.textContent.trim() };
}, dial1);
ok(!r.missing && r.hidden === true && r.display === 'none', 'преди таймер остатъкът не се вижда', r);

// 2: Ctrl-клик отваря избора и не затваря часовника.
await page.click(dial1, { modifiers: ['Control'] });
await page.waitForTimeout(150);
let pick = await page.evaluate((sel) => {
  const p = document.querySelector(sel + ' .note-timer-picker');
  const dial = document.querySelector(sel);
  return {
    dialStillOpen: !!(dial && dial.querySelector('.center')),
    shown: !!p && !p.hidden && getComputedStyle(p).display !== 'none',
    buttons: p ? [...p.querySelectorAll('.note-timer-pick')].map(b => b.textContent.trim()) : [],
    minutes: p ? [...p.querySelectorAll('.note-timer-pick')].map(b => b.dataset.minutes) : [],
    hasStop: !!(p && p.querySelector('.note-timer-stop')),
    modes: p ? [...p.querySelectorAll('.note-timer-mode')].map(b => b.textContent.trim()) : [],
    activeMode: p ? [...p.querySelectorAll('.note-timer-mode.is-active')].map(b => b.dataset.noteTimerMode).join(',') : null,
    gridShown: !!(p && (() => { const g = p.querySelector('.note-timer-body[data-note-timer-body="timer"]'); return g && !g.hidden && getComputedStyle(g).display !== 'none'; })()),
    inside: p ? (() => { const a = p.getBoundingClientRect(), b = dial.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1; })() : false,
  };
}, dial1);
ok(pick.dialStillOpen, 'Ctrl-клик не затваря часовника', pick);
ok(pick.shown, 'Ctrl-клик отваря избора на минути', pick);
ok(pick.modes.join(',') === 'Таймер,Аларма', `изборът предлага режими „Таймер“ и „Аларма“ (${pick.modes.join(',')})`, pick);
ok(pick.activeMode === 'timer' && pick.gridShown, 'по подразбиране е отворен режимът „Таймер“ с минутите', pick);
ok(pick.minutes.join(',') === '1,3,5,10,15,30', `изборът предлага 1/3/5/10/15/30 мин (${pick.minutes.join(',')})`, pick);
ok(pick.hasStop, 'изборът има бутон „Стоп“', pick);
ok(pick.inside, 'изборът стои в рамките на циферблата', pick);

// 3: избираме 1 минута.
await page.click(`${dial1} .note-timer-pick[data-minutes="1"]`);
await page.waitForTimeout(200);
let started = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  const p = document.querySelector(sel + ' .note-timer-picker');
  const n6 = document.querySelector(sel + ' .n6');
  const a = el.getBoundingClientRect(), b = n6.getBoundingClientRect(), dial = document.querySelector(sel).getBoundingClientRect();
  return {
    shown: !el.hidden && getComputedStyle(el).display !== 'none',
    text: el.textContent.trim(),
    pickerHidden: !!p && p.hidden,
    above6: a.bottom <= b.top + 1,
    insideDial: a.left >= dial.left - 1 && a.right <= dial.right + 1,
    centred: Math.abs((a.left + a.right) / 2 - (dial.left + dial.right) / 2) <= 3,
    expiredClass: el.classList.contains('is-expired'),
  };
}, dial1);
ok(started.shown, 'след избор на минути остатъкът се вижда', started);
ok(/^1:00$/.test(started.text), `остатъкът тръгва от 1:00 (${started.text})`, started);
ok(started.pickerHidden, 'изборът се затваря след избиране на минути', started);
ok(started.above6, 'остатъкът стои над числото 6', started);
ok(started.insideDial && started.centred, 'остатъкът е в циферблата и е центриран', started);
ok(!started.expiredClass, 'пуснатият таймер още не е изтекъл', started);

// 4: тактът е 15 сек — след 16 сек остатъкът вече е друг.
const t1 = Date.now();
await page.waitForTimeout(16200);
let tick = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  return { text: el.textContent.trim(), hidden: el.hidden };
}, dial1);
ok(!tick.hidden && tick.text !== started.text && /^0:4[45]$|^0:4[0-9]$/.test(tick.text),
  `след ~15 сек остатъкът се обновява (${started.text} → ${tick.text}, изминали ${Math.round((Date.now() - t1) / 1000)}s)`, tick);

// 5: до изтичане остатъкът не е с камбанка.
ok(!/🔔/.test(tick.text), 'преди изтичане няма камбанка', tick);

// 6: изчакваме изтичането (общо 60 сек от пускането).
const before = await page.evaluate(() => window.__osc);
await page.waitForFunction((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  return !!el && /🔔/.test(el.textContent);
}, dial1, { timeout: 60000, polling: 500 });
const after = await page.evaluate(() => window.__osc);
let expired = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  return { text: el.textContent.trim(), cls: el.classList.contains('is-expired'), dialOpen: !!document.querySelector(sel + ' .center') };
}, dial1);
ok(/^0:00\s*🔔$/.test(expired.text), `при изтичане остатъкът е 0:00 с камбанка (${expired.text})`, expired);
ok(expired.cls, 'изтеклият таймер се маркира с червено', expired);
ok(after > before, `при изтичане се пуска кратък beep (осцилатори ${before} → ${after})`, { before, after });
ok(expired.dialOpen, 'циферблатът остава отворен след изтичането', expired);

// 7: „Стоп“ маха таймера.
await page.click(dial1, { modifiers: ['Control'] });
await page.waitForTimeout(150);
const stopShown = await page.evaluate((sel) => {
  const p = document.querySelector(sel + ' .note-timer-picker');
  return !!p && !p.hidden;
}, dial1);
ok(stopShown, 'Ctrl-клик отваря избора и при пуснат таймер', stopShown);
await page.click(`${dial1} .note-timer-stop`);
await page.waitForTimeout(200);
let stopped = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  return { hidden: el.hidden, text: el.textContent.trim(), pickerHidden: document.querySelector(sel + ' .note-timer-picker').hidden };
}, dial1);
ok(stopped.hidden && stopped.text === '', '„Стоп“ маха остатъка', stopped);
ok(stopped.pickerHidden, 'изборът се затваря след „Стоп“', stopped);

// 8: таймерът се помни по бележка — пускаме пак и отваряме часовника наново.
await page.click(dial1, { modifiers: ['Control'] });
await page.waitForTimeout(150);
await page.click(`${dial1} .note-timer-pick[data-minutes="5"]`);
await page.waitForTimeout(200);
const beforeText = await page.evaluate((sel) => document.querySelector(sel + ' .note-timer-readout').textContent.trim(), dial1);
// обикновен клик затваря часовника (както преди)
await page.click(dial1);
await page.waitForTimeout(300);
const closed = await page.evaluate((sel) => !document.querySelector(sel), dial1);
ok(closed, 'обикновеният клик затваря часовника както преди', closed);
await page.click('#notes-container .note[data-i="201"] .note-header-time');
await page.waitForSelector(dial1, { timeout: 5000 });
let again = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  return { hidden: el.hidden, text: el.textContent.trim() };
}, dial1);
ok(!again.hidden && /^[45]:\d\d$/.test(again.text), `при ново отваряне таймерът е налице (${beforeText} → ${again.text})`, again);

// 9: дълго натискане (телефон) отваря избора на втора бележка и не затваря часовника.
await page.click(`${note202} .note-header-time`);
await page.waitForSelector(dial2, { timeout: 5000 });
const box = await page.evaluate((sel) => {
  const r = document.querySelector(sel).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, dial2);
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.waitForTimeout(900);
await page.mouse.up();
await page.waitForTimeout(250);
let longPress = await page.evaluate((sel) => {
  const p = document.querySelector(sel + ' .note-timer-picker');
  return {
    dialStillOpen: !!document.querySelector(sel + ' .center'),
    shown: !!p && !p.hidden && getComputedStyle(p).display !== 'none',
  };
}, dial2);
ok(longPress.shown, 'дълго натискане отваря избора на минути', longPress);
ok(longPress.dialStillOpen, 'дълго натискане не затваря часовника', longPress);

// 10: режим „Аларма“ — изборът сменя тялото на полето за час.
await page.click(`${dial2} .note-timer-mode[data-note-timer-mode="alarm"]`);
await page.waitForTimeout(150);
let alarmUi = await page.evaluate((sel) => {
  const p = document.querySelector(sel + ' .note-timer-picker');
  const body = p.querySelector('.note-timer-body[data-note-timer-body="alarm"]');
  const gridBody = p.querySelector('.note-timer-body[data-note-timer-body="timer"]');
  const input = p.querySelector('.note-timer-alarm-time');
  const a = p.getBoundingClientRect(), d = document.querySelector(sel).getBoundingClientRect();
  return {
    alarmShown: !!body && !body.hidden && getComputedStyle(body).display !== 'none',
    gridHidden: !!gridBody && gridBody.hidden,
    inputType: input ? input.type : null,
    value: input ? input.value : null,
    hasSet: !!p.querySelector('.note-timer-alarm-set'),
    activeMode: [...p.querySelectorAll('.note-timer-mode.is-active')].map(b => b.dataset.noteTimerMode).join(','),
    inside: a.left >= d.left - 1 && a.right <= d.right + 1 && a.top >= d.top - 1 && a.bottom <= d.bottom + 1,
    dialOpen: !!document.querySelector(sel + ' .center'),
  };
}, dial2);
ok(alarmUi.alarmShown, 'режимът „Аларма“ показва полето за час', alarmUi);
ok(alarmUi.gridHidden, 'при „Аларма“ изборът на минути се скрива', alarmUi);
ok(alarmUi.inputType === 'time' && /^\d{2}:\d{2}$/.test(alarmUi.value || ''),
  `полето е за час и вече има предложение (${alarmUi.value})`, alarmUi);
ok(alarmUi.hasSet && alarmUi.activeMode === 'alarm', 'има бутон „Задай“ и активен таб „Аларма“', alarmUi);
ok(alarmUi.inside && alarmUi.dialOpen, 'изборът с алармата стои в циферблата и не го затваря', alarmUi);

// 11: аларма за точен час → редът показва само часа, без обратно броене.
const alarmAt = await page.evaluate(() => {
  const d = new Date(Date.now() + 3 * 60000);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
});
await page.fill(`${dial2} .note-timer-alarm-time`, alarmAt);
await page.click(`${dial2} .note-timer-alarm-set`);
await page.waitForTimeout(250);
let alarmRow = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  return {
    hidden: el.hidden,
    text: el.textContent.trim(),
    pickerHidden: document.querySelector(sel + ' .note-timer-picker').hidden,
  };
}, dial2);
ok(!alarmRow.hidden && alarmRow.text === alarmAt,
  `след „Задай“ редът показва насрочения час (${alarmAt} → ${alarmRow.text})`, alarmRow);
ok(/^\d{2}:\d{2}$/.test(alarmRow.text), 'алармата не показва обратно броене', alarmRow);
ok(alarmRow.pickerHidden, 'изборът се затваря след „Задай“', alarmRow);

// 12: 15-секундният такт не пипа часа на алармата.
await page.waitForTimeout(16200);
const alarmStill = await page.evaluate((sel) => document.querySelector(sel + ' .note-timer-readout').textContent.trim(), dial2);
ok(alarmStill === alarmAt, `след ~15 сек часът на алармата е същият (${alarmStill})`, { alarmAt, alarmStill });

// 13: алармата звъни и остава със същия час, само с камбанка.
const alarmNow = await page.evaluate(() => {
  const d = new Date(Date.now() + 900);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
});
const oscBefore = await page.evaluate(() => window.__osc);
await page.evaluate(() => { noteTimerStart(202, 900, 'alarm'); });
await page.waitForTimeout(1500);
const oscAfter = await page.evaluate(() => window.__osc);
let rang = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  return { text: el.textContent.trim(), cls: el.classList.contains('is-expired') };
}, dial2);
ok(rang.text === alarmNow + ' 🔔', `изтеклата аларма държи часа и слага камбанка (${rang.text})`, { alarmNow, rang });
ok(rang.cls, 'изтеклата аларма се маркира с червено', rang);
ok(oscAfter > oscBefore, `изтеклата аларма пуска кратък beep (осцилатори ${oscBefore} → ${oscAfter})`, { oscBefore, oscAfter });

// 14: изборът помни режима — отваря се на „Аларма“ с часа на алармата; „Стоп“ я маха.
await page.click(dial2, { modifiers: ['Control'] });
await page.waitForTimeout(150);
const remember = await page.evaluate((sel) => {
  const p = document.querySelector(sel + ' .note-timer-picker');
  const input = p.querySelector('.note-timer-alarm-time');
  return {
    shown: !p.hidden,
    activeMode: [...p.querySelectorAll('.note-timer-mode.is-active')].map(b => b.dataset.noteTimerMode).join(','),
    value: input ? input.value : null,
  };
}, dial2);
ok(remember.shown && remember.activeMode === 'alarm', 'при пусната аларма изборът се отваря на „Аларма“', remember);
ok(remember.value === (rang.text || '').replace(' 🔔', ''), `полето показва часа на пуснатата аларма (${remember.value})`, { remember, rang });
await page.click(`${dial2} .note-timer-stop`);
await page.waitForTimeout(200);
const alarmStopped = await page.evaluate((sel) => {
  const el = document.querySelector(sel + ' .note-timer-readout');
  return { hidden: el.hidden, text: el.textContent.trim() };
}, dial2);
ok(alarmStopped.hidden && alarmStopped.text === '', '„Стоп“ маха и алармата', alarmStopped);

// 16: бутоните на минутите носят само числото, без „мин“.
const numOnly = await page.evaluate((sel) => {
  const p = document.querySelector(sel + ' .note-timer-picker');
  return [...p.querySelectorAll('.note-timer-pick')].map(b => b.textContent.trim());
}, dial1);
ok(numOnly.join(',') === '1,3,5,10,15,30', `бутоните на минутите са само числа (${numOnly.join(',')})`, numOnly);

// 17: редът с остатъка е вдигнат с 20px — на 50px от долния ръб на циферблата.
await page.evaluate(() => { noteTimerStop(201); noteTimerStart(201, 5 * 60000, 'timer'); });
await page.waitForTimeout(200);
const lift = await page.evaluate((sel) => {
  const dial = document.querySelector(sel);
  const el = dial.querySelector('.note-timer-readout');
  const n6 = dial.querySelector('.n6');
  const center = dial.querySelector('.center');
  const a = el.getBoundingClientRect(), d = dial.getBoundingClientRect();
  const b = n6.getBoundingClientRect(), c = center.getBoundingClientRect();
  return {
    text: el.textContent.trim(),
    gapBottom: Math.round(d.bottom - a.bottom),
    cssBottom: getComputedStyle(el).bottom,
    scale: Math.round((d.width / dial.offsetWidth) * 100) / 100,
    aboveNumber6: a.bottom <= b.top + 1,
    clearsCenter: a.bottom <= c.top || a.top >= c.bottom,
    inside: a.left >= d.left - 1 && a.right <= d.right + 1 && a.top >= d.top - 1 && a.bottom <= d.bottom + 1,
    centred: Math.abs((a.left + a.right) / 2 - (d.left + d.right) / 2) <= 3,
  };
}, dial1);
// Циферблатът се мащабира (0.85 на 390px), затова 50 CSS px се виждат като ~43 екранни:
// проверява се CSS стойността и екранната, сметната през мащаба.
ok(lift.cssBottom === '50px' && lift.gapBottom === Math.round(50 * lift.scale),
  `остатъкът е вдигнат с 20px (30 → 50 CSS px, ${lift.gapBottom}px на екран при мащаб ${lift.scale})`, lift);
ok(lift.aboveNumber6 && lift.clearsCenter && lift.inside && lift.centred,
  'вдигнатият остатък е над 6, не застъпва центъра и остава в циферблата', lift);

// Помощни за прозорците на бележките.
const windowsNow = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('#note-windows-layer .note-window.visible')];
  const idOf = (w) => { const b = w.querySelector('[data-id]'); return b ? String(b.dataset.id) : null; };
  const act = all.find(w => w.classList.contains('note-window-active'));
  return { count: all.length, ids: all.map(idOf), activeId: act ? idOf(act) : null };
});

// 18: алармата вдига бележката — отваря прозореца ѝ и той идва отпред.
// Алармата от раздел 13 вече отваря бележката си (новото изискване), затова прозорците се
// затварят тук: иначе „преди алармата няма отворени прозорци“ мери този остатък.
await page.evaluate(() => closeAllNoteWindows());
await page.waitForTimeout(200);
await page.evaluate(`(async () => {
  const now = Date.now();
  const mk2 = (id, txt) => ({
    alarm_type: -1, boardid: 'B1', calendarDate: 0, color: 0, date: now - 60000, datemod: now - 30000,
    eventId: 0, gdid: 'GN' + id, id, notetxt: txt, numord: id, sellist: 0, status: 0,
    text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1,
  });
  for (const nt of [mk2(203, 'бележка с аларма'), mk2(204, 'бележка за единичен режим')]) {
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    if (el) notesContainer.appendChild(el);
  }
  applyFilters();
})()`);
await page.waitForTimeout(300);
const winsBefore = await windowsNow();
await page.evaluate(() => { noteTimerStart(203, 900, 'alarm'); });
await page.waitForTimeout(1600);
const winsAfter = await windowsNow();
ok(winsBefore.count === 0, 'преди алармата няма отворени прозорци на бележки', winsBefore);
ok(winsAfter.count === 1 && winsAfter.activeId === '203',
  'изтеклата аларма отваря бележката и я вдига отпред', { winsBefore, winsAfter });

// 19: в режим „Единична бележка“ алармата не отваря втори прозорец, но пак звъни.
await page.evaluate(() => localStorage.setItem('singleNoteMode', 'true'));
const oscSingleBefore = await page.evaluate(() => window.__osc);
await page.evaluate(() => { noteTimerStart(204, 700, 'alarm'); });
await page.waitForTimeout(1400);
const winsSingle = await windowsNow();
const oscSingleAfter = await page.evaluate(() => window.__osc);
ok(winsSingle.count === winsAfter.count && !winsSingle.ids.includes('204'),
  'в режим „Единична бележка“ алармата не вдига бележката', { winsAfter, winsSingle });
ok(oscSingleAfter > oscSingleBefore, 'в „Единична бележка“ алармата пак звъни', { oscSingleBefore, oscSingleAfter });
await page.evaluate(() => localStorage.removeItem('singleNoteMode'));

// 20: дълго натискане с пръст върху циферблата отваря таймера, но НЕ маркира бележката.
const longDial = await page.evaluate((sel) => {
  if (selectionState.active) exitSelectionMode();
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, composed: true,
    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
  }));
  return true;
}, dial1);
await page.waitForTimeout(950);
const afterLong = await page.evaluate((sel) => {
  const card = document.querySelector('#notes-container .note[data-i="201"]');
  const p = document.querySelector(sel + ' .note-timer-picker');
  const out = {
    selActive: !!selectionState.active,
    keys: [...selectionState.keys],
    marked: !!(card && card.classList.contains('note-selected')),
    pickerShown: !!p && !p.hidden,
  };
  document.querySelector(sel).dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, pointerId: 7, pointerType: 'touch', button: 0,
  }));
  return out;
}, dial1);
ok(!afterLong.selActive && !afterLong.marked && afterLong.keys.length === 0,
  'дълго натискане върху циферблата не маркира бележката', longDial && afterLong);
ok(afterLong.pickerShown, 'дългото натискане пак отваря избора на минути', afterLong);

// 21: Ctrl-клик върху циферблата също не маркира бележката.
await page.evaluate(() => { if (selectionState.active) exitSelectionMode(); });
await page.click(dial1, { modifiers: ['Control'] });
await page.waitForTimeout(250);
const afterCtrl = await page.evaluate(() => {
  const card = document.querySelector('#notes-container .note[data-i="201"]');
  return { selActive: !!selectionState.active, keys: [...selectionState.keys], marked: !!(card && card.classList.contains('note-selected')) };
});
ok(!afterCtrl.selActive && !afterCtrl.marked && afterCtrl.keys.length === 0,
  'Ctrl-клик върху циферблата не маркира бележката', afterCtrl);

// 22: докато има избор, клик в хедъра маха отметката вместо да показва JSON-а.
await page.evaluate((sel) => { if (!document.querySelector(sel + ' .note-timer-picker').hidden) document.querySelector(sel + ' .note-timer-picker').hidden = true; }, dial1);
await page.evaluate(() => {
  window.__calls = [];
  const orig = window.showModal;
  window.showModal = function (...a) { window.__calls.push(a.length); return orig.apply(this, a); };
  enterSelectionMode('GN201');
});
await page.waitForTimeout(200);
const selOn = await page.evaluate(() => ({ active: !!selectionState.active, keys: [...selectionState.keys] }));
await page.evaluate(() => {
  const w = document.querySelector('#notes-container .note[data-i="201"] .note-title-wrapper');
  w.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(250);
const hdr = await page.evaluate(() => {
  const card = document.querySelector('#notes-container .note[data-i="201"]');
  return {
    active: !!selectionState.active, keys: [...selectionState.keys],
    marked: !!(card && card.classList.contains('note-selected')),
    calls: (window.__calls || []).length,
  };
});
ok(selOn.active && selOn.keys.length === 1 && selOn.keys[0] === 'GN201', 'преди клика бележката е избрана', selOn);
ok(!hdr.active && hdr.keys.length === 0 && !hdr.marked, 'клик в хедъра маха избора на избраната бележка', hdr);
ok(hdr.calls === 0, 'кликът в хедъра не показва JSON-а, докато има избор', hdr);

// 23: без избор клик в хедъра пак показва JSON-а.
await page.evaluate(() => { window.__calls = []; });
await page.evaluate(() => {
  const w = document.querySelector('#notes-container .note[data-i="201"] .note-title-wrapper');
  w.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(250);
const jsonAgain = await page.evaluate(() => (window.__calls || []).length);
ok(jsonAgain === 1, 'без избор клик в хедъра пак показва JSON-а', { jsonAgain });

// 15: без грешки в конзолата.
ok(errs.length === 0, 'без изключения в конзолата', errs.slice(0, 3));

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} паднаха` : ''));
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
