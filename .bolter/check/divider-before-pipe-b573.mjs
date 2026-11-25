// Разделител, сложен точно преди '|' („Списък за пазаруване\n/-|☑ Мляко 1“), трябва да се вижда
// на БОРДА: заглавието е един ред със засичане и дотук изрязваше целия ред „/-“.
// Run from the repo root: PAGE=http://127.0.0.1:8099/nomn/index.html node .bolter/check/divider-before-pipe-b573.mjs
import { chromium } from 'playwright';

const PAGE = process.env.PAGE || 'http://127.0.0.1:8099/nomn/index.html';

let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m, extra !== undefined ? JSON.stringify(extra) : ''); };

// 1) бележката на собственика: разделител „/-“ плътно преди „|“
const SHOP = 'Списък за пазаруване\n/-|☑ Мляко 1\n☑ Хляб 2\n☑ Краставици 3\n☐ Ябълки 5\n\n';
// 2) двойна линия преди „|“
const DOUBLE = 'Заглавие\n/-=|ред на тялото\n';
// 3) разделител със заглавие, подравнено отляво, преди „|“
const TITLED = 'Заглавие\n/-< отляво|ред на тялото\n';
// 4) без разделител преди „|“ — нищо не се променя
const PLAIN = 'Заглавие|ред на тялото\n';
// 5) разделител в ТЯЛОТО (не преди „|“) — рисува се точно веднъж, без добавка от картата
const BODY_HR = 'Заглавие|първи ред\n/-\nпоследен ред\n';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof getFormattedNoteHtml === 'function' && typeof contentModal !== 'undefined', null, { timeout: 30000 });
await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
await page.waitForFunction(() => contentModal, null, { timeout: 30000 });

const cases = [
  { gdid: 'p-shop', id: 992001, txt: SHOP },
  { gdid: 'p-double', id: 992002, txt: DOUBLE },
  { gdid: 'p-titled', id: 992003, txt: TITLED },
  { gdid: 'p-plain', id: 992004, txt: PLAIN },
  { gdid: 'p-bodyhr', id: 992005, txt: BODY_HR },
];

const r = await page.evaluate(async (cases) => {
  const make = async (c) => {
    const obj = {
      alarm_type: -1, boardid: (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0].gdid : null,
      calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0, gdid: c.gdid, id: c.id,
      notetxt: c.txt, numord: 1, pass: false, sellist: 0, status: 0, text_span: '',
      timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 292,
    };
    allNotesData.push(obj);
    const el = await createNoteElement(obj);
    el.style.display = '';
    el.dataset.probe = c.gdid;
    document.getElementById('notes-container').appendChild(el);
  };
  for (const c of cases) await make(c);
  await new Promise(r => setTimeout(r, 800));
  const out = {};
  for (const c of cases) {
    const card = document.querySelector(`.note[data-probe="${c.gdid}"]`);
    if (!card) { out[c.gdid] = { missing: true }; continue; }
    const h3 = card.querySelector('h3');
    const content = card.querySelector('.note-content');
    const hrs = content ? Array.from(content.querySelectorAll('.md-hr, .md-hr-titled, hr')) : [];
    const first = hrs[0];
    const cb = content ? content.querySelector('.nmd-cb, .nmd-cb-pair') : null;
    const rect = e => { const b = e.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height), w: Math.round(b.width) }; };
    out[c.gdid] = {
      title: h3 ? h3.textContent : null,
      titleScroll: h3 ? h3.scrollWidth : null,
      titleClient: h3 ? h3.clientWidth : null,
      hrCount: hrs.length,
      hrClass: first ? first.className : null,
      hrText: first ? (first.textContent || '').trim() : null,
      hrRect: first ? rect(first) : null,
      hrAboveCheckbox: (first && cb) ? first.getBoundingClientRect().top <= cb.getBoundingClientRect().top : null,
      text: content ? content.textContent.replace(/\s+/g, ' ').trim() : null,
    };
  }
  for (const c of cases) { const el = document.querySelector(`.note[data-probe="${c.gdid}"]`); if (el) el.remove(); }
  return out;
}, cases);

const shop = r['p-shop'];
ok(!shop.missing, 'бележката с „/-“ пред „|“ е на борда');
ok(shop.title === 'Списък за пазаруване', 'заглавието е само думите, без разделителя', shop.title);
ok(shop.hrCount === 1, 'на борда има точно една линия', shop.hrCount);
ok(shop.hrClass && /md-hr/.test(shop.hrClass), 'линията е от разделителите (md-hr)', shop.hrClass);
ok(shop.hrRect && shop.hrRect.h > 0, 'линията има височина, значи се вижда', shop.hrRect);
ok(shop.hrAboveCheckbox === true, 'линията стои над списъка', shop.hrAboveCheckbox);
ok(shop.titleScroll <= shop.titleClient + 2, 'заглавието не се реже (без разделителя)', { s: shop.titleScroll, c: shop.titleClient });

const dbl = r['p-double'];
ok(dbl.hrCount === 1 && /md-hr-double/.test(dbl.hrClass || ''), 'двойната линия „/-=“ преди „|“ е двойна', dbl.hrClass);
ok(dbl.title === 'Заглавие', 'двойната линия не влиза в заглавието', dbl.title);

const tit = r['p-titled'];
ok(tit.hrCount === 1 && /md-hr-titled/.test(tit.hrClass || '') && /md-hr-left/.test(tit.hrClass || ''),
  'разделителят със заглавие пази подравняването си', tit.hrClass);
ok(tit.hrText === 'отляво', 'текстът на разделителя е „отляво“', tit.hrText);

const plain = r['p-plain'];
ok(plain.hrCount === 0, 'без разделител преди „|“ нищо не се добавя', plain.hrCount);
ok(plain.title === 'Заглавие', 'обикновеното заглавие е непроменено', plain.title);

const body = r['p-bodyhr'];
ok(body.hrCount === 1, 'разделителят в тялото се рисува точно веднъж', body.hrCount);

const modal = await page.evaluate((txt) => {
  const el = document.createElement('div');
  el.id = 'modal-body';
  document.body.appendChild(el);
  el.innerHTML = getFormattedNoteHtml(txt, '', '', true);
  const out = { hrs: el.querySelectorAll('.md-hr').length, text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) };
  el.remove();
  return out;
}, SHOP);
ok(modal.hrs === 1, 'модалът показва една линия, както преди', modal.hrs);

ok(consoleErrors.length === 0, 'няма конзолни грешки', consoleErrors);

console.log(`\n${n - fails}/${n} ok`);
await browser.close();
process.exit(fails ? 1 : 0);
