// Бележка със заглавие ('|') и болд в тялото трябва да рендира болда на БОРДА.
// text_span при '|' е тяло-относителен (вж. postEditNoteState), затова бордът не бива да
// вади офсета на заглавието от него. Без '|' форматите са спрямо целия текст и офсетът важи.
// Run from the repo root: node .bolter/check/board-format-pipe.mjs
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const PORT = 8798;
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const b = await readFile(path.join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store'}); res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT);

let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m, extra !== undefined ? JSON.stringify(extra) : ''); };

const F = (start, end, type = 1) => JSON.stringify({ start, end, type });

// 1) '|' бележка: заглавие + болд в началото на тялото (тяло-относителен text_span)
const PIPE_TITLE = 'Заглавие';
const PIPE_BODY = 'дебел текст и още думи';
const PIPE_TXT = `${PIPE_TITLE}|${PIPE_BODY}`;
const PIPE_SPAN = F(0, 5); // "дебел" в координати на ТЯЛОТО

// 2) без '|': първият ред се показва като заглавие, форматите са спрямо целия текст
const PLAIN_TITLE = 'Първи ред';
const PLAIN_BODY = 'дебел текст и още думи';
const PLAIN_TXT = `${PLAIN_TITLE}\n${PLAIN_BODY}`;
const PLAIN_SPAN = F(PLAIN_TITLE.length + 1, PLAIN_TITLE.length + 1 + 5); // "дебел" в целия текст

// 3) '|' бележка с болд по средата на тялото (по-далеч от 0)
const MID_BODY = 'началото тук има дебел край';
const MID_TXT = `Друго заглавие|${MID_BODY}`;
const MID_FROM = MID_BODY.indexOf('дебел');
const MID_SPAN = F(MID_FROM, MID_FROM + 5);

const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome' });
const consoleErrors = [];

for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
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
    const host = document.getElementById('notes-container');
    const built = [];
    for (const nt of notes) {
      const obj = {
        alarm_type: -1, boardid: board.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
        eventId: 0, gdid: nt.gdid, id: nt.id, notetxt: nt.txt, numord: nt.id, sellist: 0, status: 0,
        text_span: nt.span, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244
      };
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
      };
    }
    for (const gd of built) { const c = document.querySelector(`.note[data-probe="${gd}"]`); if (c) c.remove(); }
    return out;
  }, [
    { gdid: 'pipe-bold', id: 910001, txt: PIPE_TXT, span: PIPE_SPAN },
    { gdid: 'plain-bold', id: 910002, txt: PLAIN_TXT, span: PLAIN_SPAN },
    { gdid: 'pipe-mid', id: 910003, txt: MID_TXT, span: MID_SPAN },
  ]);

  const p = r['pipe-bold'];
  ok(!p.missing, `${width}: | бележката е на борда`);
  ok(p.title === PIPE_TITLE, `${width}: заглавието е отделено от тялото`, p.title);
  ok(p.boldCount === 1, `${width}: | бележка с болд в тялото има точно един болд на борда`, p.boldCount);
  ok(p.boldText === 'дебел', `${width}: болдът е точно думата "дебел"`, p.boldText);
  ok(p.boldStyle && parseInt(p.boldStyle) >= 600, `${width}: болдът наистина е получер`, p.boldStyle);
  ok(p.text && p.text.includes(PIPE_BODY.replace(PIPE_TITLE, '')), `${width}: тялото не губи текст`, p.text);

  const q = r['plain-bold'];
  ok(!q.missing, `${width}: бележката без | е на борда`);
  ok(q.title === PLAIN_TITLE, `${width}: първият ред е заглавие без |`, q.title);
  ok(q.boldCount === 1, `${width}: без | болдът също се рендира (офсетът още важи)`, q.boldCount);
  ok(q.boldText === 'дебел', `${width}: без | болдът е точно "дебел"`, q.boldText);

  const m = r['pipe-mid'];
  ok(!m.missing, `${width}: | бележка с болд по средата е на борда`);
  ok(m.boldCount === 1 && m.boldText === 'дебел', `${width}: болдът по средата на тялото не се измества`, { c: m.boldCount, t: m.boldText });

  await ctx.close();
}

// модалът не бива да се променя от тази поправка
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => consoleErrors.push(`modal pageerror: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => typeof startApp === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
  await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
  const html = await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'modal-body';
    document.body.appendChild(el);
    el.innerHTML = getFormattedNoteHtml('**дебел** текст и още', null, null, true, undefined);
    const out = { bold: el.querySelectorAll('b, strong').length, text: el.textContent };
    el.remove();
    return out;
  });
  ok(html.bold === 1, 'модалът рендира болда от маркдаун както преди', html);
}

ok(consoleErrors.length === 0, 'няма конзолни грешки', consoleErrors);

srv.close();
await browser.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
