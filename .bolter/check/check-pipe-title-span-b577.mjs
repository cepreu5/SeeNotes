// Границите на форматите при бележка със заглавие преди '|' (b5.77).
// Указание на собственика, 26 Nov 2026: „коригирай границите с дължината на текста преди | плюс 1
// заради самата черта“. Записът пази границите в координати на текста ПРЕДИ чертата (собственикът
// слага чертата след като е сложил bold), значи при показване всяка граница се смъква с изрязаното
// заглавие, а при запис през полето за заглавие се вдига с дължината му.
//
// Проверява се по ИСТИНСКИЯ път на картата (createNoteElement), модала (getFormattedNoteHtml) и
// записа (postEditNoteState):
//   1) случаят на собственика: „Това е bold текст“ с bold 7..11, после черта след първата дума —
//      и с интервал преди чертата, и без; bold-ът трябва да е върху „bold“;
//   2) запис от приложението (граници вдигнати с дължината на заглавието) — bold върху „дебел“;
//   3) стар запис с тяло-относителни граници (преди b5.77) — не губи форматите си;
//   4) бележка без „|“ — първият ред е заглавие, както преди;
//   5) втора черта в тялото не дели нищо;
//   6) тяло с Markdown таблица след разделителя;
//   7) запис през полето за заглавие: postEditNoteState вдига границите, а показването ги връща.
// Пуска се от корена на хранилището:
//   node .bolter/check/check-pipe-title-span-b577.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'nomn');
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
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
  if (!cond) fails++;
};

const F = (start, end, type = 1) => JSON.stringify({ start, end, type });

// 1) Случаят на собственика: записът е правен преди чертата, bold 7..11 в „Това е bold текст“.
const OWN_SPAN = F(7, 11);
const OWN_PIPE_SPACED = 'Това |е bold текст';    // черта след интервала
const OWN_PIPE_SPACE_AFTER = 'Това| е bold текст'; // черта преди интервала
// 2) Запис от приложението: заглавие през полето, границите вдигнати с дължината му (b5.77).
const APP_TITLE = 'Заглавие';
const APP_BODY = 'дебел текст и още думи';
const APP_TXT = `${APP_TITLE}|${APP_BODY}`;
const APP_SPAN = F(APP_TITLE.length, APP_TITLE.length + 5);
// 3) Стар запис (преди b5.77): същият текст, но границите тяло-относителни.
const OLD_SPAN = F(0, 5);
// 4) Без „|“.
const PLAIN_TITLE = 'Първи ред';
const PLAIN_BODY = 'дебел текст и още думи';
const PLAIN_TXT = `${PLAIN_TITLE}\n${PLAIN_BODY}`;
const PLAIN_SPAN = F(PLAIN_TITLE.length + 1, PLAIN_TITLE.length + 1 + 5);
// 5) Втора черта в тялото.
const SECOND_PIPE_TXT = 'Заглавие|ред с | черта вътре';
// 6) Тяло с Markdown таблица след разделителя.
const TABLE_TXT = 'Таблица|Mляко и хляб\n| acc | брой |\n| --- | --- |\n| serbox | 9 |';

const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome' });
const consoleErrors = [];

for (const width of [1280, 412]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) consoleErrors.push(`${width}px: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`${width}px pageerror: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => typeof startApp === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
  await page.waitForFunction(() => contentModal, null, { timeout: 20000 });

  const r = await page.evaluate(async (notes) => {
    const board = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
    const host = document.getElementById('notes-container') || document.body;
    const built = [];
    for (const nt of notes) {
      const obj = {
        alarm_type: -1, boardid: board.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
        eventId: 0, gdid: nt.gdid, id: nt.id, notetxt: nt.txt, numord: nt.id, sellist: 0, status: 0,
        text_span: nt.span, title_span: nt.titleSpan || '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244
      };
      if (nt.hidden) obj.pass = true;
      allNotesData.push(obj);
      const el = await createNoteElement(obj);
      el.dataset.probe = nt.gdid;
      host.appendChild(el);
      built.push(nt.gdid);
    }
    await new Promise(r => setTimeout(r, 500));
    const out = {};
    for (const nt of notes) {
      const card = document.querySelector(`.note[data-probe="${nt.gdid}"]`);
      if (!card) { out[nt.gdid] = { missing: true }; continue; }
      const content = card.querySelector('.note-content');
      const h3 = card.querySelector('h3');
      const b = content ? content.querySelector('b, strong') : null;
      out[nt.gdid] = {
        title: h3 ? h3.textContent.trim() : null,
        html: content ? content.innerHTML : null,
        text: content ? content.textContent : null,
        boldCount: content ? content.querySelectorAll('b, strong').length : 0,
        boldText: b ? b.textContent : null,
        boldStyle: b ? getComputedStyle(b).fontWeight : null,
        tables: card.querySelectorAll('table').length,
      };
    }
    const modalProbe = (html) => {
      const d = document.createElement('div');
      d.innerHTML = html;
      const b = d.querySelector('b, strong');
      return { html, boldCount: d.querySelectorAll('b, strong').length, boldText: b ? b.textContent : null };
    };
    out.__modal = {
      ownerSpaced: modalProbe(getFormattedNoteHtml(notes[0].txt, notes[0].span, '', true)),
      ownerSpaceAfter: modalProbe(getFormattedNoteHtml(notes[1].txt, notes[1].span, '', true)),
      app: modalProbe(getFormattedNoteHtml(notes[2].txt, notes[2].span, '', true)),
      old: modalProbe(getFormattedNoteHtml(notes[3].txt, notes[3].span, '', true)),
    };
    // Записът през полето за заглавие: границите се вдигат с дължината на заглавието.
    const bodyFormats = JSON.stringify({ start: 0, end: 5, type: 1, paramint: 0, paramfloat: 0 });
    const saved = postEditNoteState('дебел текст и още думи', bodyFormats, 'Заглавие', '', true, []);
    const savedCard = await (async () => {
      const obj = {
        alarm_type: -1, boardid: board.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
        eventId: 0, gdid: 'saved-pipe', id: 916010, notetxt: saved.text, numord: 916010, sellist: 0, status: 0,
        text_span: saved.format, title_span: saved.titleFormat, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244
      };
      allNotesData.push(obj);
      const el = await createNoteElement(obj);
      el.dataset.probe = 'saved-pipe';
      host.appendChild(el);
      await new Promise(r => setTimeout(r, 300));
      const card = document.querySelector('.note[data-probe="saved-pipe"]');
      const content = card ? card.querySelector('.note-content') : null;
      const b = content ? content.querySelector('b, strong') : null;
      return { text: saved.text, format: saved.format, boldText: b ? b.textContent : null, title: card && card.querySelector('h3') ? card.querySelector('h3').textContent.trim() : null };
    })();
    out.__saved = savedCard;
    for (const gd of built) { const c = document.querySelector(`.note[data-probe="${gd}"]`); if (c) c.remove(); }
    const sc = document.querySelector('.note[data-probe="saved-pipe"]'); if (sc) sc.remove();
    return out;
  }, [
    { gdid: 'own-spaced', id: 916001, txt: OWN_PIPE_SPACED, span: OWN_SPAN },
    { gdid: 'own-after', id: 916002, txt: OWN_PIPE_SPACE_AFTER, span: OWN_SPAN },
    { gdid: 'app-pipe', id: 916003, txt: APP_TXT, span: APP_SPAN },
    { gdid: 'old-pipe', id: 916004, txt: APP_TXT, span: OLD_SPAN },
    { gdid: 'plain-bold', id: 916005, txt: PLAIN_TXT, span: PLAIN_SPAN },
    { gdid: 'second-pipe', id: 916006, txt: SECOND_PIPE_TXT, span: '' },
    { gdid: 'table-body', id: 916007, txt: TABLE_TXT, span: '' },
  ]);

  const a = r['own-spaced'];
  ok(!a.missing, `${width}: бележката „Това |е bold текст“ е на борда`);
  ok(a.title === 'Това', `${width}: заглавието е „Това“`, a.title);
  ok(a.boldCount === 1, `${width}: има точно един bold в картата`, a.boldCount);
  ok(a.boldText === 'bold', `${width}: bold-ът е точно върху „bold“ (черта след интервала)`, { t: a.boldText, html: a.html });
  ok(a.boldStyle && parseInt(a.boldStyle) >= 600, `${width}: bold-ът наистина е получер`, a.boldStyle);
  ok((a.text || '').includes('текст'), `${width}: останалият текст не се губи`, a.text);
  ok(!(a.text || '').includes('|'), `${width}: разделителят не се показва като знак`, a.text);

  const a2 = r['own-after'];
  ok(a2.boldCount === 1 && a2.boldText === 'bold', `${width}: bold-ът е точно върху „bold“ (черта преди интервала)`, { c: a2.boldCount, t: a2.boldText, html: a2.html });
  ok(a2.title === 'Това', `${width}: заглавието е „Това“ и във втория вариант`, a2.title);

  const p = r['app-pipe'];
  ok(!p.missing, `${width}: контролната бележка от приложението е на борда`);
  ok(p.title === APP_TITLE, `${width}: контролата е със заглавие „${APP_TITLE}“`, p.title);
  ok(p.boldCount === 1 && p.boldText === 'дебел', `${width}: записът от приложението не се смъква втори път`, { c: p.boldCount, t: p.boldText, html: p.html });

  const o = r['old-pipe'];
  ok(o.boldCount === 1 && o.boldText === 'дебел', `${width}: старият запис с тяло-относителни граници запазва bold върху „дебел“`, { c: o.boldCount, t: o.boldText, html: o.html });

  const q = r['plain-bold'];
  ok(!q.missing, `${width}: бележката без „|“ е на борда`);
  ok(q.title === PLAIN_TITLE, `${width}: първият ред е заглавие без „|“`, q.title);
  ok(q.boldCount === 1 && q.boldText === 'дебел', `${width}: без „|“ bold-ът е точно „дебел“`, { c: q.boldCount, t: q.boldText });

  const s = r['second-pipe'];
  ok(!s.missing, `${width}: бележката с втора черта е на борда`);
  ok(s.title === 'Заглавие', `${width}: само първата черта дели заглавие`, s.title);
  ok((s.text || '').includes('| черта вътре'), `${width}: втората черта остава в текста`, s.text);
  ok(!/черта вътре[\s\S]*черта вътре/.test(s.text || ''), `${width}: текстът не се повтаря`, s.text);

  const t = r['table-body'];
  ok(!t.missing, `${width}: бележката с таблица в тялото е на борда`);
  ok(t.tables === 1, `${width}: таблицата в тялото се рисува като таблица`, { tables: t.tables, html: t.html });
  ok((t.text || '').includes('serbox') && (t.text || '').includes('брой'), `${width}: клетките на таблицата са на място`, t.text);

  const m = r.__modal;
  ok(m.ownerSpaced.boldCount === 1 && m.ownerSpaced.boldText === 'bold', `${width}: модалът дава bold върху „bold“`, m.ownerSpaced);
  ok(m.ownerSpaceAfter.boldCount === 1 && m.ownerSpaceAfter.boldText === 'bold', `${width}: модалът дава bold върху „bold“ и във втория вариант`, m.ownerSpaceAfter);
  ok(m.app.boldCount === 1 && m.app.boldText === 'дебел', `${width}: модалът не смъква записа от приложението`, m.app);
  ok(m.old.boldCount === 1 && m.old.boldText === 'дебел', `${width}: модалът пази стария запис`, m.old);

  const sv = r.__saved;
  ok(sv.text === `${APP_TITLE}|${APP_BODY}`, `${width}: записът пази заглавие и тяло през „|“`, sv.text);
  ok(/"start":8,"end":13/.test(sv.format), `${width}: границите се вдигат с дължината на заглавието`, sv.format);
  ok(sv.boldText === 'дебел', `${width}: записаната бележка показва bold върху „дебел“`, sv);

  await ctx.close();
}

ok(consoleErrors.length === 0, 'няма конзолни грешки', consoleErrors);

srv.close();
await browser.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
