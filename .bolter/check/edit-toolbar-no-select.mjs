// Стрелките в лентата с инструменти и лентата на бележката не се маркират (b2.81).
// Оплакването на собственика: „когато задържа бутон със стрелка от лентата с инструменти за
// форматиране, самият глиф на стрелката се маркира като текст (синя селекция)" и същото за лентата
// на бележката - името на борда, датата/часът и кръгчетата.
// Решението (b2.81): CSS `user-select: none` за `.modal-edit-toolbar` и `.modal-header-toolbar` с
// децата им (плюс реда с датата/часа `.modal-note-footer`) + пазач на `selectstart` в capture фаза
// във `wireNoteWindow` - плъзгане, започнало върху лента, не маркира и текст в тялото.
// Тестът проверява в истинска страница (uni/ в локален режим, без Google Drive):
//   1) getComputedStyle дава user-select: none за двете ленти, за стрелка ↶ (undo) и за ←, за
//      името на борда и за реда с датата/часа;
//   2) ИСТИНСКО задържане с мишката (mousedown, ~600ms, mouseup) върху ↶ и върху ← не оставя
//      селекция, а `selectstart`, пуснат върху буton/борда, е defaultPrevented;
//   3) контрола: селекцията в редактора (тялото на бележката) още работи - `selectstart` там НЕ е
//      preventDefault-нат, `user-select` не е none, а setSelectionRange дава истинска селекция;
//   4) дългото натискане на ← още мести каретата в началото на реда, а обикновен клик на B още
//      слага `**` около селекцията.
// Пуска се от корена на хранилището:
//   node .bolter/check/edit-toolbar-no-select.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import { existsSync } from 'node:fs'; import path from 'node:path';

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

// Chromium в сандбокса е под два номера: този, който playwright очаква, и по-новият. Вземаме този,
// който наистина е на място, за да не зависи тестът от симлинк.
const CHROME = [
  '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome',
  '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
].find(p => existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--num-raster-threads=4'] } : { args: ['--num-raster-threads=4'] });

// Локален режим, без Google Drive (както table-edit.mjs): приложението стартира и без вход.
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
    localStorage.setItem('notesBgrd', 'false');
  } catch (e) { }
});
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForFunction(() => typeof version !== 'undefined' && version && typeof startApp === 'function', null, { timeout: 20000 });
await page.evaluate(async () => { if (!contentModal) await startApp().catch(() => { }); });
await page.waitForFunction(() => !!contentModal, null, { timeout: 20000 });
errs.length = 0; // шумът от стартирането без Drive не е наш

const NOTE = 'Първи ред\nБББББ\nПоследен ред';
const LINE2 = NOTE.indexOf('Б'); // началото на втория ред

// Бележка в паметта (за да има ред с датата/часа в долната лента) + борд за името в хедъра.
const openEditing = (raw) => page.evaluate((raw) => {
  const now = Date.now();
  boardsData = boardsData.filter(b => b.gdid !== 'B1');
  boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' });
  allNotesData = allNotesData.filter(x => String(x.id) !== '777');
  allNotesData.push({
    alarm_type: -1, boardid: 'B1', calendarDate: 0, color: 0, date: now - 60000, datemod: now - 30000,
    eventId: 0, gdid: 'GN777', id: 777, notetxt: raw, numord: 1, sellist: 0, status: 0,
    text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1,
  });
  showModal({ raw, id: 777, gdid: 'GN777', boardId: 'B1', forceShowBoardName: true });
  enableNoteEditing(document.getElementById('modal-body'));
}, raw);
await openEditing(NOTE);
await page.waitForSelector('#content-modal .modal-edit-toolbar', { timeout: 8000 });
await page.waitForSelector('#note-edit-textarea', { timeout: 8000 });

// Всичко се мери в активния прозорец на бележката (= #content-modal, защото е активен).
const BOX = '#content-modal .modal-content-box';
const styleOf = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  // -webkit-touch-callout е свойство на Safari: Chromium не го пази и тук връща празен низ.
  return { us: cs.userSelect, wus: cs.webkitUserSelect, callout: cs.getPropertyValue('-webkit-touch-callout') || '' };
}, sel);

// ---- 1) getComputedStyle: лентите и децата им не се маркират -----------------------------------
{
  const leftBtnSel = `${BOX} .modal-edit-toolbar button:nth-last-child(3)`;
  const findLeft = await page.evaluate((box) => {
    const tb = document.querySelector(box + ' .modal-edit-toolbar');
    const btns = tb ? [...tb.querySelectorAll('button')] : [];
    const left = btns.find(b => b.textContent.trim() === '←');
    const undo = tb ? tb.querySelector('.modal-edit-toolbar-btn.is-undo') : null;
    if (left) left.dataset.checkLeft = '1';
    if (undo) undo.dataset.checkUndo = '1';
    return { count: btns.length, left: !!left, undo: !!undo, labels: btns.map(b => b.textContent.trim()).join(' ') };
  }, BOX);
  ok(findLeft.left && findLeft.undo, `лентата има бутон ↶ и бутон ← (${findLeft.labels})`, findLeft);

  const targets = [
    ['лентата с инструменти', `${BOX} .modal-edit-toolbar`],
    ['стрелката ↶ (undo)', `${BOX} .modal-edit-toolbar-btn.is-undo`],
    ['стрелката ←', `${BOX} .modal-edit-toolbar [data-check-left="1"]`],
    ['лентата на бележката', `${BOX} .modal-header-toolbar`],
    ['името на борда', `${BOX} .modal-header-toolbar #modal-board-name, ${BOX} .modal-header-toolbar .nw-modal-board-name`],
    ['кръгчето (затваряне)', `${BOX} .modal-header-toolbar > .modal-close`],
    ['редът с датата/часа', `${BOX} .modal-note-footer`],
    ['датата в него', `${BOX} .modal-note-footer .note-header-date`],
  ];
  for (const [name, sel] of targets) {
    const s = await styleOf(sel);
    if (!s) { ok(false, `${name}: елементът не е намерен (${sel})`); continue; }
    ok(s.us === 'none' && s.wus === 'none' && (s.callout === '' || s.callout === 'none'),
      `${name}: user-select: none (${s.us} / ${s.wus} / callout ${s.callout || '-'})`, s);
  }
}

// ---- 2) Истинско задържане върху стрелките не маркира -----------------------------------------
const centre = async (sel) => {
  const loc = page.locator(sel);
  await loc.scrollIntoViewIfNeeded().catch(() => { });
  const b = await loc.boundingBox();
  if (!b) return null;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
};
const selectionText = () => page.evaluate(() => window.getSelection ? window.getSelection().toString() : null);
const hitAt = (pt) => page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return el ? (el.className || el.tagName) + '' : null;
}, [pt.x, pt.y]);

for (const [name, sel] of [
  ['↶ (undo)', `${BOX} .modal-edit-toolbar-btn.is-undo`],
  ['←', `${BOX} .modal-edit-toolbar [data-check-left="1"]`],
]) {
  const pt = await centre(sel);
  ok(!!pt, `${name}: бутонът има място на екрана`, pt && pt.box);
  if (!pt) continue;
  await page.evaluate(() => window.getSelection && window.getSelection().removeAllRanges());
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  // Държим плътно 600ms - така минава и дългото натискане (500ms), и времето, за което браузърът
  // би започнал селекция. Малко плъзгане в рамките на бутона е точно това, което прави пръстът.
  await page.mouse.move(pt.x + 6, pt.y + 1);
  await page.waitForTimeout(600);
  await page.mouse.up();
  const after = await selectionText();
  ok(after === '', `задържане 600ms върху ${name}: няма маркиран текст (${JSON.stringify(after)})`, { after, at: await hitAt(pt) });
}

// Истинско плъзгане, започнало върху лентата с инструменти (в празната ивица под бутоните) и
// излязло надолу върху текста на бележката: без пазача на selectstart то би маркирало тялото.
{
  const drag = await page.evaluate((box) => {
    const tb = document.querySelector(box + ' .modal-edit-toolbar');
    const r = tb.getBoundingClientRect();
    // Долната ивица на лентата е padding (padding-bottom: 8px) - там няма бутон за натискане.
    const x = Math.round(r.left + 20), y = Math.round(r.bottom - 3);
    const el = document.elementFromPoint(x, y);
    window.getSelection().removeAllRanges();
    return { x, y, target: el ? (el.className || el.tagName) : null, onToolbar: !!(el && el.closest('.modal-edit-toolbar')), isButton: !!(el && el.closest('button')) };
  }, BOX);
  ok(drag.onToolbar && !drag.isButton, `плъзгането започва върху самата лента, не върху бутон (${drag.target})`, drag);
  await page.mouse.move(drag.x, drag.y);
  await page.mouse.down();
  await page.mouse.move(drag.x + 10, drag.y + 160, { steps: 8 });
  await page.waitForTimeout(60);
  await page.mouse.up();
  const sel = await selectionText();
  ok(sel === '', `плъзгане от лентата надолу върху текста не маркира нищо (${JSON.stringify(sel)})`, sel);
  await page.evaluate(() => window.getSelection().removeAllRanges());
}

// selectstart, пуснат върху бутона и върху името на борда, се спира от пазача.
const prevented = await page.evaluate((box) => {
  const fire = (el) => {
    if (!el) return null;
    const e = new Event('selectstart', { bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  };
  return {
    undo: fire(document.querySelector(box + ' .modal-edit-toolbar-btn.is-undo')),
    left: fire(document.querySelector(box + ' [data-check-left="1"]')),
    header: fire(document.querySelector(box + ' .modal-header-toolbar')),
    board: fire(document.querySelector(box + ' .modal-header-toolbar #modal-board-name, ' + box + ' .modal-header-toolbar .nw-modal-board-name')),
  };
}, BOX);
ok(prevented.undo === true, 'selectstart върху ↶ е defaultPrevented', prevented);
ok(prevented.left === true, 'selectstart върху ← е defaultPrevented', prevented);
ok(prevented.header === true, 'selectstart върху лентата на бележката е defaultPrevented', prevented);
ok(prevented.board === true, 'selectstart върху името на борда е defaultPrevented', prevented);

// ---- 3) Контрола: селекцията в тялото/редактора още работи --------------------------------------
{
  const ctrl = await page.evaluate(() => {
    const t = document.getElementById('note-edit-textarea');
    const body = document.getElementById('modal-body');
    const e = new Event('selectstart', { bubbles: true, cancelable: true });
    t.dispatchEvent(e);
    t.focus();
    t.setSelectionRange(0, 5);
    return {
      prevented: e.defaultPrevented,
      us: getComputedStyle(t).userSelect,
      bodyUs: body ? getComputedStyle(body).userSelect : null,
      selected: t.value.substring(t.selectionStart, t.selectionEnd),
      start: t.selectionStart, end: t.selectionEnd,
    };
  });
  ok(ctrl.prevented === false, 'редакторът: selectstart НЕ е defaultPrevented', ctrl);
  ok(ctrl.us !== 'none', `редакторът: user-select не е none (${ctrl.us})`, ctrl);
  ok(ctrl.bodyUs !== 'none', `тялото на бележката: user-select не е none (${ctrl.bodyUs})`, ctrl);
  ok(ctrl.selected === 'Първи' && ctrl.start === 0 && ctrl.end === 5, `редакторът: селекция 0-5 работи (${JSON.stringify(ctrl.selected)})`, ctrl);
}

// ---- 4) Дългото натискане на ← мести каретата в началото на реда -------------------------------
{
  await page.evaluate((i) => {
    const t = document.getElementById('note-edit-textarea');
    t.focus();
    t.setSelectionRange(i, i);
  }, LINE2 + 4);
  const pt = await centre(`${BOX} .modal-edit-toolbar [data-check-left="1"]`);
  ok(!!pt, '←: бутонът е на екрана за дългото натискане', pt && pt.box);
  if (pt) {
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  const caret = await page.evaluate(() => {
    const t = document.getElementById('note-edit-textarea');
    return { start: t.selectionStart, end: t.selectionEnd, active: document.activeElement === t, value: t.value };
  });
  ok(caret.start === LINE2 && caret.end === LINE2,
    `дълго натискане на ←: каретата отива в началото на реда (${caret.start}, чакаме ${LINE2})`, caret);
  ok(caret.active, 'дълго натискане на ←: фокусът е в редактора', caret);
}

// ---- 5) Обикновен клик на B още слага получерно на селекцията ----------------------------------
// В cx-notes markdown-ът на бележка без таблица се пази като диапазони за формати (backdrop), не
// като литерални ** в текста: затова се проверява И ефектът - диапазон за получерно (type 1) точно
// върху селекцията, И литералните ** (при бележка с таблица форматите не се пазят и знаците влизат
// в текста, както преди).
{
  const before = await page.evaluate((i) => {
    const t = document.getElementById('note-edit-textarea');
    t.focus();
    t.setSelectionRange(i, i + 3);
    return t.value;
  }, LINE2);
  await page.locator(`${BOX} .modal-edit-toolbar-btn.is-bold`).click();
  await page.waitForTimeout(80);
  const after = await page.evaluate((i) => {
    const t = document.getElementById('note-edit-textarea');
    const ctx = typeof getNoteEditContext === 'function' ? getNoteEditContext(t) : null;
    const formats = ctx ? readNoteEditFormats(ctx.modalBody, ctx.key) : [];
    const S = ctx ? ctx.off + i : i, E = S + 3;
    return {
      value: t.value,
      formats: formats.map(f => ({ type: f.type, start: f.start, end: f.end })),
      S, E,
      covered: formats.some(f => f.type === 1 && f.start <= S && f.end >= E),
    };
  }, LINE2);
  ok(after.value.includes('**БББ**') || after.covered,
    `клик на B: селекцията става получерна (${after.covered ? 'диапазон type 1 върху ' + after.S + '-' + after.E : JSON.stringify(after.value)})`, { before, after });
}

// ---- 6) Същото на широка страница (1280): правилата не зависят от ширината ---------------------
{
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  const wide = await page.evaluate((box) => {
    const fire = (el) => {
      if (!el) return null;
      const e = new Event('selectstart', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const undo = document.querySelector(box + ' .modal-edit-toolbar-btn.is-undo');
    const header = document.querySelector(box + ' .modal-header-toolbar');
    const t = document.getElementById('note-edit-textarea');
    return {
      undoUs: undo ? getComputedStyle(undo).userSelect : null,
      headerUs: header ? getComputedStyle(header).userSelect : null,
      undoBlocked: fire(undo),
      headerBlocked: fire(header),
      editorBlocked: fire(t),
      editorUs: t ? getComputedStyle(t).userSelect : null,
    };
  }, BOX);
  ok(wide.undoUs === 'none' && wide.headerUs === 'none', `1280: лентите пак са user-select: none (${wide.undoUs} / ${wide.headerUs})`, wide);
  ok(wide.undoBlocked === true && wide.headerBlocked === true, '1280: selectstart върху лентите е спрян', wide);
  ok(wide.editorBlocked === false && wide.editorUs !== 'none', `1280: редакторът още се маркира (blocked ${wide.editorBlocked}, ${wide.editorUs})`, wide);
}

// ---- 7) Залепналият hover: фонът при задържане е само за устройства с мишка (b2.82) ----------
// Собственикът (25.10.2026): „след дълго натискане бутонът със стрелки остава натиснат и след
// освобождаване - нека си връща първоначалния цвят". Причината: `.modal-edit-toolbar-btn:hover` дава
// фон и кант, а на телефон браузърът оставя :hover залепен след дългото натискане. Затова правилото
// за hover е вътре в `@media (hover: hover)`, а `:focus-visible` (клавиатурата) остава извън него.
{
  const css = await readFile(path.join(root, 'style.css'), 'utf8');
  // Блокът на @media, в който попада даден селектор: броят се скобите от началото на медията.
  const mediaBlockOf = (needle) => {
    const at = css.indexOf(needle);
    if (at < 0) return { found: false };
    const mediaAt = css.lastIndexOf('@media (hover: hover)', at);
    if (mediaAt < 0) return { found: true, inMedia: false, at };
    let depth = 0, i = css.indexOf('{', mediaAt), end = -1;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return { found: true, inMedia: at > mediaAt && at < end, at, mediaAt, end };
  };
  const hover = mediaBlockOf('.modal-edit-toolbar-btn:hover');
  const focus = mediaBlockOf('.modal-edit-toolbar-btn:focus-visible');
  ok(hover.found && hover.inMedia,
    `hover-фонът на бутоните е вътре в @media (hover: hover) (${JSON.stringify(hover)})`, hover);
  ok(focus.found, ':focus-visible правилото за бутоните още съществува', focus);
  ok(focus.found && focus.inMedia === false,
    `:focus-visible остава ИЗВЪН @media (hover: hover) - клавиатурата вижда фокуса (${JSON.stringify(focus)})`, focus);
  // Контрола: на десктоп (тук има истинска мишка) подсветката още работи - тя не е изчезнала, а е
  // ограничена до устройствата, на които има смисъл.
  const hasHover = await page.evaluate(() => matchMedia('(hover: hover)').matches);
  ok(hasHover === true, `браузърът на теста е устройство с мишка (hover: ${hasHover})`);
  const pt = await centre(`${BOX} .modal-edit-toolbar-btn.is-undo`);
  if (pt) {
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(60);
    const hovered = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, `${BOX} .modal-edit-toolbar-btn.is-undo`);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(60);
    const away = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, `${BOX} .modal-edit-toolbar-btn.is-undo`);
    ok(hovered === 'rgba(255, 255, 255, 0.35)',
      `с мишка бутонът още светва при посочване (${hovered})`, hovered);
    ok(away === 'rgba(0, 0, 0, 0)',
      `и се връща към първоначалния прозрачен фон, щом показалецът се махне (${away})`, away);
  }
}

// ---- 8) След дълго натискане фокусът не остава върху бутона (blur) ----------------------------
// `:focus-visible` би държал фона на бутона дори когато браузърът вече е махнал :hover, затова след
// задържане бутонът се освобождава. Проверява се върху ▦ (без таблица в бележката той не пипа
// текста и не мести фокуса в редактора), за да се види САМОТО освобождаване.
{
  const tableBtn = `${BOX} .modal-edit-toolbar-btn.is-table`;
  await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.focus(); }, tableBtn);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('modal-edit-toolbar-btn')
    ? document.activeElement.textContent.trim() : null);
  ok(focused === '▦', `▦ е фокусиран преди задържането (${focused})`, focused);
  // Задържане с пръст: истински touchstart/touchend с 620ms между тях.
  const press = await page.evaluate(async (s) => {
    const b = document.querySelector(s);
    if (!b) return { pressed: false };
    const t = (type) => {
      const touch = new Touch({ identifier: 3, target: b, clientX: 10, clientY: 10 });
      const active = type === 'touchend' ? [] : [touch];
      return new TouchEvent(type, { bubbles: true, cancelable: true, touches: active, targetTouches: active, changedTouches: [touch] });
    };
    b.dispatchEvent(t('touchstart'));
    await new Promise(r => setTimeout(r, 620));
    b.dispatchEvent(t('touchend'));
    return {
      pressed: true,
      activeIsButton: document.activeElement === b,
      activeTag: document.activeElement ? document.activeElement.tagName + '.' + (document.activeElement.className || '') : null,
    };
  }, tableBtn);
  ok(press.pressed && press.activeIsButton === false,
    `след touchend бутонът не е document.activeElement (${press.activeTag})`, press);
}

// ---- 9) Второ задържане на ←/→ стига до началото/края на ЦЕЛИЯ текст -------------------------
// Собственикът (25.10.2026): „когато сме преместили курсора в началото/края на реда с този бутон и го
// задържим повторно, курсорът да отива в началото/края на целия текст на бележката".
{
  // Стрелките се отбелязват по текста си, за да не зависи изборът от подредбата на лентата.
  const arrows = await page.evaluate((box) => {
    const tb = document.querySelector(box + ' .modal-edit-toolbar');
    const btns = tb ? [...tb.querySelectorAll('button')] : [];
    const left = btns.find(b => b.textContent.trim() === '←');
    const right = btns.find(b => b.textContent.trim() === '→');
    if (left) left.dataset.checkLeft = '1';
    if (right) right.dataset.checkRight = '1';
    return { left: !!left, right: !!right };
  }, BOX);
  ok(arrows.left && arrows.right, 'ескалация: лентата има бутони ← и →', arrows);
  const LEFT = `${BOX} .modal-edit-toolbar [data-check-left="1"]`;
  const RIGHT = `${BOX} .modal-edit-toolbar [data-check-right="1"]`;
  const clickHold = async (sel, holdMs = 650) => {
    const p = await centre(sel);
    if (!p) return false;
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    await page.mouse.up();
    await page.waitForTimeout(50);
    return true;
  };
  const caretOf = () => page.evaluate(() => {
    const t = document.getElementById('note-edit-textarea');
    return { start: t.selectionStart, end: t.selectionEnd, len: t.value.length, value: t.value };
  });
  const setCaret = (i) => page.evaluate((i) => {
    const t = document.getElementById('note-edit-textarea');
    t.focus();
    t.setSelectionRange(i, i);
  }, i);

  // ←: от средата на втория ред до неговото начало (първото задържане), после пак ← - начало на текста.
  await setCaret(LINE2 + 4);
  ok(await clickHold(LEFT), 'ескалация ←: първото задържане минава');
  let c = await caretOf();
  ok(c.start === LINE2, `ескалация ←: първото задържане стига до началото на реда (${c.start}, чакаме ${LINE2})`, c);
  ok(await clickHold(LEFT), 'ескалация ←: второто задържане минава');
  c = await caretOf();
  ok(c.start === 0 && c.end === 0,
    `ескалация ←: второто задържане стига до НАЧАЛОТО на целия текст (${c.start}, дължина ${c.len})`, c);
  // Трето задържане не мести нищо (вече е в началото).
  await clickHold(LEFT);
  c = await caretOf();
  ok(c.start === 0, `ескалация ←: третото задържане оставя каретата в началото (${c.start})`, c);

  // →: от средата на първия ред до края на реда, после пак → - край на целия текст.
  const line1End = 9; // „Първи ред" (без \n)
  await setCaret(4);
  ok(await clickHold(RIGHT), 'ескалация →: първото задържане минава');
  c = await caretOf();
  ok(c.start === line1End, `ескалация →: първото задържане стига до края на реда (${c.start}, чакаме ${line1End})`, c);
  ok(await clickHold(RIGHT), 'ескалация →: второто задържане минава');
  c = await caretOf();
  ok(c.start === c.len && c.end === c.len,
    `ескалация →: второто задържане стига до КРАЯ на целия текст (${c.start} от ${c.len})`, c);

  // Същото през самата функция (Ctrl/⌘-пътят на бутоните ползва същия escalate):
  const direct = await page.evaluate(() => {
    const t = document.getElementById('note-edit-textarea');
    const out = {};
    t.focus(); t.setSelectionRange(12, 12);
    // Без escalate: само до ръба на реда.
    window.moveCaretToLineEdge(t, false, false);
    out.plain = t.selectionStart;
    // Същата позиция, но с escalate: началото на целия текст.
    t.setSelectionRange(out.plain, out.plain);
    window.moveCaretToLineEdge(t, false, false, true);
    out.escalated = t.selectionStart;
    // Един знак надясно и без escalate: ръбът на ВИЗУАЛНИЯ ред, а не на абзаца.
    t.setSelectionRange(out.plain, out.plain);
    window.moveCaretToLineEdge(t, true, false, false);
    out.lineEnd = t.selectionStart;
    return out;
  });
  ok(direct.escalated === 0 && direct.plain > 0,
    `moveCaretToLineEdge с escalate: от ръба на реда (${direct.plain}) до началото на текста (${direct.escalated})`, direct);
  ok(direct.lineEnd === 15,
    `moveCaretToLineEdge без escalate спира на ръба на реда (${direct.lineEnd}), не на края на текста`, direct);
}

ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`, errs);

await ctx.close();
await browser.close(); srv.close();
console.log(`PASSED=${n - fails} FAILED=${fails}`);
process.exit(fails ? 1 : 0);
