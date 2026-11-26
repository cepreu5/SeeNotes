// Бележка със заглавие преди '|' (b5.76, указание на собственика 26 Nov 2026: „Всички граници
// трябва да се коригират с дължината на преместения като заглавие текст“).
// Границите в text_span са спрямо ЦЕЛИЯ текст; картата изрязва заглавието от тялото, значи всяка
// граница се смъква с него. Дотук картата ги приемаше за тяло-относителни и bold падаше върху
// съседна дума.
// Проверява се по ИСТИНСКИЯ път на картата (createNoteElement) и в модала (getFormattedNoteHtml):
//   1) случаят на собственика: „Това | е bold текст“ с bold 9..13 в целия текст → bold върху „bold“;
//   2) контрола: запис от приложението (title_span е зададен → форматите са тяло-относителни) не се
//      смъква втори път;
//   3) бележка без „|“: първият ред е заглавие, форматите са спрямо целия текст — както преди;
//   4) втора черта в тялото не дели нищо: остава знак на един ред (само първата черта е заглавие);
//   5) тяло с Markdown таблица след разделителя се рисува като таблица;
//   6) модалът (getFormattedNoteHtml върху целия текст) дава същия bold.
// Пуска се от корена на хранилището:
//   node .bolter/check/check-span-shift-pipe-b576.mjs      (exit 1 при провалена проверка)
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

// 1) Случаят на собственика: бележка „Това | е bold текст“, bold 9..13 в координати на ЦЕЛИЯ текст.
const OWN_TXT = 'Това | е bold текст';
const OWN_FROM = OWN_TXT.indexOf('bold');
const OWN_SPAN = F(OWN_FROM, OWN_FROM + 4);

// 2) Контрола: запис от приложението — заглавие през полето, форматите тяло-относителни.
const APP_TITLE = 'Заглавие';
const APP_BODY = 'дебел текст и още думи';
const APP_TXT = `${APP_TITLE}|${APP_BODY}`;
const APP_SPAN = F(0, 5);
const APP_TITLE_SPAN = F(0, APP_TITLE.length);

// 3) Без „|“: първият ред е заглавие, форматите са спрямо целия текст.
const PLAIN_TITLE = 'Първи ред';
const PLAIN_BODY = 'дебел текст и още думи';
const PLAIN_TXT = `${PLAIN_TITLE}\n${PLAIN_BODY}`;
const PLAIN_SPAN = F(PLAIN_TITLE.length + 1, PLAIN_TITLE.length + 1 + 5);

// 4) Втора черта в тялото.
const SECOND_PIPE_TXT = 'Заглавие|ред с | черта вътре';

// 5) Тяло с Markdown таблица след разделителя.
const TABLE_TXT = 'Таблица|\n| acc | брой |\n| --- | --- |\n| serbox | 9 |';

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
    // Модалът минава по същия форматиращ път, но върху ЦЕЛИЯ текст.
    const modalProbe = (html) => {
      const d = document.createElement('div');
      d.innerHTML = html;
      const b = d.querySelector('b, strong');
      return { html, boldCount: d.querySelectorAll('b, strong').length, boldText: b ? b.textContent : null };
    };
    out.__modal = {
      owner: modalProbe(getFormattedNoteHtml(notes[0].txt, notes[0].span, '', true)),
      app: modalProbe(getFormattedNoteHtml(notes[1].txt, notes[1].span, notes[1].titleSpan || '', true)),
    };
    for (const gd of built) { const c = document.querySelector(`.note[data-probe="${gd}"]`); if (c) c.remove(); }
    return out;
  }, [
    { gdid: 'own-pipe', id: 916001, txt: OWN_TXT, span: OWN_SPAN },
    { gdid: 'app-pipe', id: 916002, txt: APP_TXT, span: APP_SPAN, titleSpan: APP_TITLE_SPAN },
    { gdid: 'plain-bold', id: 916003, txt: PLAIN_TXT, span: PLAIN_SPAN },
    { gdid: 'second-pipe', id: 916004, txt: SECOND_PIPE_TXT, span: '' },
    { gdid: 'table-body', id: 916005, txt: TABLE_TXT, span: '' },
  ]);

  const a = r['own-pipe'];
  ok(!a.missing, `${width}: бележката „Това | е bold текст“ е на борда`);
  ok(a.title === 'Това', `${width}: заглавието е „Това“`, a.title);
  ok(a.boldCount === 1, `${width}: има точно един bold в картата`, a.boldCount);
  ok(a.boldText === 'bold', `${width}: bold-ът е точно върху „bold“, не върху „текст“`, { t: a.boldText, html: a.html });
  ok(a.boldStyle && parseInt(a.boldStyle) >= 600, `${width}: bold-ът наистина е получер`, a.boldStyle);
  ok((a.text || '').includes('е') && (a.text || '').includes('текст'), `${width}: останалият текст не се губи`, a.text);
  ok(!(a.text || '').includes('|'), `${width}: разделителят не се показва като знак`, a.text);

  const p = r['app-pipe'];
  ok(!p.missing, `${width}: контролната бележка от приложението е на борда`);
  ok(p.title === APP_TITLE, `${width}: контролата е със заглавие „${APP_TITLE}“`, p.title);
  ok(p.boldCount === 1 && p.boldText === 'дебел', `${width}: тяло-относителните формати не се смъкват втори път`, { c: p.boldCount, t: p.boldText });

  const q = r['plain-bold'];
  ok(!q.missing, `${width}: бележката без „|“ е на борда`);
  ok(q.title === PLAIN_TITLE, `${width}: първият ред е заглавие без „|“`, q.title);
  ok(q.boldCount === 1 && q.boldText === 'дебел', `${width}: без „|“ bold-ът е точно „дебел“`, { c: q.boldCount, t: q.boldText });

  const s = r['second-pipe'];
  ok(!s.missing, `${width}: бележката с втора черта е на борда`);
  ok(s.title === 'Заглавие', `${width}: само първата черта дели заглавие`, s.title);
  ok((s.text || '').includes('| черта вътре'), `${width}: втората черта остава в текста на един ред`, s.text);
  ok(!/черта вътре[\s\S]*черта вътре/.test(s.text || ''), `${width}: текстът не се повтаря`, s.text);

  const t = r['table-body'];
  ok(!t.missing, `${width}: бележката с таблица в тялото е на борда`);
  ok(t.tables === 1, `${width}: таблицата в тялото се рисува като таблица`, { tables: t.tables, html: t.html });
  ok((t.text || '').includes('serbox') && (t.text || '').includes('брой'), `${width}: клетките на таблицата са на място`, t.text);

  const m = r.__modal;
  ok(m.owner.boldCount === 1 && m.owner.boldText === 'bold', `${width}: модалът дава bold точно върху „bold“`, m.owner);
  ok(/<(strong|b)[^>]*>дебел/.test(m.app.html || ''), `${width}: модалът не смъква контролата`, m.app);

  await ctx.close();
}

ok(consoleErrors.length === 0, 'няма конзолни грешки', consoleErrors);

srv.close();
await browser.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
