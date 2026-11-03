// Панелът на таймера/алармата върху циферблата (клон cx-notes, b3.61).
// Проверява върху истинската страница uni/index.html + uni/main.js:
//   1) панелът е тесен и с еднаква ширина в двата режима — полето за час вече не го разпъва;
//   2) всички бутони в панела (режими, минути, „Задай“, „Стоп“) са по-високи, за да се натискат с пръст;
//   3) часът на алармата се показва 24-часов или 12-часов според настройката на системата;
//   4) сигналът при изтичане е по-дълъг и мелодичен (осем тона в две фрази вместо един кратък).
// Пуска се от корена на хранилището (SeeNotes):
//   node .bolter/check/note-timer-panel-and-sound.mjs     (exit 1 при провалена проверка)
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

const DIAL = '#clock-201';

async function boot(locale, viewport = { width: 390, height: 844 }) {
  const browser = await chromium.launch({ args: ['--num-raster-threads=4', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', locale });
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
    // Брояч и запис на тоновете: така сигналът се проверява, без да се пипа звукът на машината.
    window.__osc = 0;
    window.__tones = [];
    window.__freqSets = [];
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      const orig = Ctx.prototype.createOscillator;
      Ctx.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
    }
    if (window.OscillatorNode && OscillatorNode.prototype.stop) {
      const stop = OscillatorNode.prototype.stop;
      OscillatorNode.prototype.stop = function (when) {
        try { window.__tones.push({ t: when }); } catch (e) { }
        return stop.call(this, when);
      };
    }
    // Честотите не се четат от frequency.value (планираните стойности още не са приложени),
    // затова се записва самото планиране; усилването ползва стойности под 1 и се пропуска.
    if (window.AudioParam && AudioParam.prototype.setValueAtTime) {
      const setv = AudioParam.prototype.setValueAtTime;
      AudioParam.prototype.setValueAtTime = function (value, time) {
        try { if (value >= 50) window.__freqSets.push({ f: value, t: time }); } catch (e) { }
        return setv.call(this, value, time);
      };
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
    const notes = [mk(201, 'бележка с таймер')];
    allNotesData = notes;
    notesContainer.innerHTML = '';
    const els = await Promise.all(notes.map(nt => createNoteElement(nt)));
    els.forEach(el => { if (el) notesContainer.appendChild(el); });
    applyFilters();
  })()`);
  await page.waitForTimeout(400);
  await page.click('#notes-container .note[data-i="201"] .note-header-time');
  await page.waitForSelector(DIAL, { timeout: 5000 });
  return { browser, page, errs };
}

const openPicker = async (page) => {
  const open = await page.evaluate((sel) => !!document.querySelector(sel + ' .note-timer-picker')
    && !document.querySelector(sel + ' .note-timer-picker').hidden, DIAL);
  if (!open) {
    await page.click(DIAL, { modifiers: ['Control'] });
    await page.waitForTimeout(200);
  }
};

const snapshot = (page) => page.evaluate((sel) => {
  const dial = document.querySelector(sel).getBoundingClientRect();
  const p = document.querySelector(sel + ' .note-timer-picker');
  const pr = p.getBoundingClientRect();
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), clipped: el.scrollWidth > el.clientWidth + 1 }; };
  const q = s => p.querySelector(s);
  return {
    dial: { w: Math.round(dial.width), h: Math.round(dial.height) },
    panel: {
      w: Math.round(pr.width), h: Math.round(pr.height),
      inside: pr.left >= dial.left - 1 && pr.right <= dial.right + 1 && pr.top >= dial.top - 1 && pr.bottom <= dial.bottom + 1,
    },
    modes: [...p.querySelectorAll('.note-timer-mode')].map(box),
    picks: [...p.querySelectorAll('.note-timer-pick')].map(box),
    stop: box(q('.note-timer-stop')),
    set: box(q('.note-timer-alarm-set')),
    input: box(q('.note-timer-alarm-time')),
  };
}, DIAL);

// ───────────────────────── 1–2: размер на панела и височина на бутоните ─────────────────────────
const { browser, page, errs } = await boot('bg-BG');
await openPicker(page);

const timerSnap = await snapshot(page);
ok(timerSnap.picks.length === 6 && timerSnap.modes.length === 2,
  'панелът в режим „Таймер“ има два режима и шест минути', timerSnap);

await page.click(`${DIAL} .note-timer-mode[data-note-timer-mode="alarm"]`);
await page.waitForTimeout(200);
const alarmSnap = await snapshot(page);

ok(Math.abs(timerSnap.panel.w - alarmSnap.panel.w) <= 2,
  `панелът е еднакъв на ширина в двата режима (${timerSnap.panel.w} / ${alarmSnap.panel.w} px)`,
  { timer: timerSnap.panel, alarm: alarmSnap.panel });
ok(alarmSnap.panel.w <= timerSnap.panel.w + 2 && alarmSnap.panel.w < 145,
  `полето за час вече не разпъва панела („Аларма“ ${alarmSnap.panel.w} px, преди 145)`, alarmSnap.panel);
ok(timerSnap.panel.inside && alarmSnap.panel.inside,
  'панелът стои в рамките на циферблата и в двата режима', { timer: timerSnap.panel, alarm: alarmSnap.panel });
ok(timerSnap.panel.h <= timerSnap.dial.h && alarmSnap.panel.h <= alarmSnap.dial.h,
  `панелът се побира по височина в циферблата (${alarmSnap.panel.h} от ${alarmSnap.dial.h} px)`,
  { timer: timerSnap.panel, alarm: alarmSnap.panel, dial: alarmSnap.dial });

const minH = Math.min(
  ...timerSnap.modes.map(b => b.h), ...timerSnap.picks.map(b => b.h), timerSnap.stop.h,
  ...alarmSnap.modes.map(b => b.h), alarmSnap.stop.h, alarmSnap.set.h, alarmSnap.input.h,
);
ok(minH >= 30, `всички бутони в панела са високи поне 30 px (най-нисък ${minH}, преди 25)`, {
  modes: timerSnap.modes.map(b => b.h), picks: timerSnap.picks.map(b => b.h),
  stop: alarmSnap.stop.h, set: alarmSnap.set.h, input: alarmSnap.input.h,
});
ok(timerSnap.modes.every(b => b.h >= 30) && timerSnap.picks.every(b => b.h >= 30),
  'режимите и минутите са по-високи в режим „Таймер“', { modes: timerSnap.modes.map(b => b.h), picks: timerSnap.picks.map(b => b.h) });
ok(alarmSnap.set.h >= 30 && alarmSnap.input.h >= 30,
  'в режим „Аларма“ и полето за час, и „Задай“ са по-високи', { set: alarmSnap.set, input: alarmSnap.input });
ok(timerSnap.picks.every(b => b.w >= 26),
  `бутоните за минути са и по-широки (${timerSnap.picks.map(b => b.w).join('/')} px)`, timerSnap.picks);
ok([...timerSnap.modes, ...timerSnap.picks, timerSnap.stop, ...alarmSnap.modes, alarmSnap.stop, alarmSnap.set]
  .every(b => !b.clipped), 'нито един надпис в панела не се реже', {
  timer: [...timerSnap.modes, ...timerSnap.picks, timerSnap.stop].map(b => b.clipped),
  alarm: [...alarmSnap.modes, alarmSnap.stop, alarmSnap.set].map(b => b.clipped),
});

// ───────────────────────── 3: 24-часов вид (българска система) ─────────────────────────
const t24 = await page.evaluate((sel) => {
  const target = Date.now() + 7 * 60000;
  window.__target = target;
  noteTimerStart(201, target - Date.now(), 'alarm');
  const el = document.querySelector(sel + ' .note-timer-readout');
  const d = new Date(target);
  const pad = v => String(v).padStart(2, '0');
  return {
    text: el.textContent.trim(),
    expected: pad(d.getHours()) + ':' + pad(d.getMinutes()),
    hour12: noteTimerUsesHour12(),
    inputValue: document.querySelector(sel + ' .note-timer-alarm-time').value,
  };
}, DIAL);
ok(t24.hour12 === false, 'българската система се разпознава като 24-часова', t24);
ok(/^\d{2}:\d{2}$/.test(t24.text), `часът на алармата е 24-часов (${t24.text})`, t24);
ok(t24.text === t24.expected, `часът съвпада с очаквания 24-часов вид (${t24.text})`, t24);

// ───────────────────────── 4: сигналът е по-дълъг и мелодичен ─────────────────────────
const oscBefore = await page.evaluate(() => window.__osc);
await page.evaluate(() => { window.__tones = []; window.__freqSets = []; noteTimerStart(201, 600, 'timer'); });
await page.waitForTimeout(1800);
const sound = await page.evaluate(() => ({
  osc: window.__osc,
  tones: window.__tones.slice(),
  freqSets: window.__freqSets.slice(),
}));
const tones = sound.tones;
const span = tones.length ? Math.max(...tones.map(t => t.t)) - Math.min(...tones.map(t => t.t)) : 0;
const freqs = sound.freqSets.map(t => Math.round(t.f));
const distinct = [...new Set(freqs)].sort((a, b) => a - b);
const firstRound = freqs.slice(0, 4);
ok(sound.osc - oscBefore === 8, `сигналът е от осем тона, не от един (осцилатори ${oscBefore} → ${sound.osc})`, sound);
ok(distinct.length >= 4, `мелодията ползва поне четири различни височини (${distinct.join(', ')} Hz)`, freqs);
ok(firstRound.length === 4 && firstRound.every((f, i) => i === 0 || f >= firstRound[i - 1]),
  `първата фраза се качва нагоре (${firstRound.join(' → ')} Hz)`, firstRound);
ok(freqs.slice(4).length === 4, 'мелодията се повтаря втора фраза', freqs);
ok(span >= 1.2, `сигналът трае поне 1.2 сек (${span.toFixed(2)} сек, преди 0.22)`, span);
await page.evaluate(() => noteTimerStop(201));

ok(errs.length === 0, `няма грешки в конзолата (${errs.length})`, errs);
await browser.close();

// ───────────────────────── 5: 12-часов вид (американска система) ─────────────────────────
const second = await boot('en-US');
await openPicker(second.page);
await second.page.click(`${DIAL} .note-timer-mode[data-note-timer-mode="alarm"]`);
await second.page.waitForTimeout(200);
const t12 = await second.page.evaluate((sel) => {
  const target = Date.now() + 9 * 60000;
  noteTimerStart(201, target - Date.now(), 'alarm');
  const el = document.querySelector(sel + ' .note-timer-readout');
  const d = new Date(target);
  const pad = v => String(v).padStart(2, '0');
  const h = d.getHours();
  return {
    text: el.textContent.trim(),
    expected: (h % 12 || 12) + ':' + pad(d.getMinutes()) + ' ' + (h < 12 ? 'AM' : 'PM'),
    hour12: noteTimerUsesHour12(),
    pad2: pad(h) + ':' + pad(d.getMinutes()),
    pickerHeight: Math.round(document.querySelector(sel + ' .note-timer-picker').getBoundingClientRect().height),
    pickerWidth: Math.round(document.querySelector(sel + ' .note-timer-picker').getBoundingClientRect().width),
  };
}, DIAL);
ok(t12.hour12 === true, 'американската система се разпознава като 12-часова', t12);
ok(/^\d{1,2}:\d{2}\s(AM|PM)$/.test(t12.text), `часът на алармата е 12-часов (${t12.text})`, t12);
ok(t12.text === t12.expected, `часът съвпада с очаквания 12-часов вид (${t12.text})`, t12);
ok(t12.text !== t12.pad2, `в 12-часов режим няма 24-часов вид (${t12.text} вместо ${t12.pad2})`, t12);
ok(second.errs.length === 0, `няма грешки в конзолата при 12-часов вид (${second.errs.length})`, second.errs);
await second.browser.close();

srv.close();
console.log(`\n${n - fails}/${n} проверки минаха`);
process.exit(fails ? 1 : 0);
