// Markdown линк [текст](адрес) се рендира като ЕДНА котва (или един съкратен span на борда),
// а не като „https://[…](“ гол текст с котва едва след „](“.  Двете бележки по-долу са истински
// текстове от борда на собственика. Пуска се от корена на хранилището:
//   node .bolter/check/md-link-render.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const SUB = 'https://charliehills.substack.com/p/rea?utm_source=substack&publication_id=2359675&post_id=220513759&utm_medium=email&utm_content=share&utm_campaign=email-share&triggerShare=true&isFreemail=true&r=8hfe7j&triedRedirect=true';
const NOTE_A = 'How to make anything look like Apple with one Claude prompt REA\n' + SUB.replace('https://', 'https://[') + '](' + SUB.replace('https://', 'http://') + ')';
const NOTE_B = 'free 5GB\nI tested open source Android storage tools; this app reliably freed 5GB of system space\n'
  + 'https://[www.androidpolice.com/tested-open-source-storage-tools-app-freed-5gb-system-space/](http://www.androidpolice.com/tested-open-source-storage-tools-app-freed-5gb-system-space/)';
const SUB_TARGET = 'http://charliehills.substack.com/p/rea?utm_source=substack&publication_id=2359675&post_id=220513759&utm_medium=email&utm_content=share&utm_campaign=email-share&triggerShare=true&isFreemail=true&r=8hfe7j&triedRedirect=true';
const B_TARGET = 'http://www.androidpolice.com/tested-open-source-storage-tools-app-freed-5gb-system-space/';
const A_SHOWN = 'https://charliehills.substack.com/p/rea';
const B_SHOWN = 'https://www.androidpolice.com/tested-open-source-storage-tools-app-freed-5gb-system-space/';

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// Нищо извън localhost: gsi клиентът получава празен заместител, за да не гърми app-ът.
await ctx.route(/^https?:\/\/(?!localhost)/, r => {
  if (r.request().url().startsWith('https://accounts.google.com/gsi/client')) {
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));

// Връща измерванията за карта на борда, построена през истинския createNoteElement.
const measureCard = (txt, oneTap) => page.evaluate(async ({ txt, oneTap }) => {
  localStorage.setItem('oneTapLink', oneTap ? 'true' : 'false');
  // Картата се слага в собствен видим контейнер: #notes-container е с височина 0 и картите в него
  // не се подреждат (content-visibility: auto ги пропуска) - тогава геометрията е 0x0 и не доказва нищо.
  let host = document.getElementById('md-link-probe-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'md-link-probe-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:640px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;z-index:99999;background:#fff;';
    document.body.appendChild(host);
  }
  const board = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  const id = 900000 + Math.floor(Math.random() * 90000);
  const nt = {
    alarm_type: -1, boardid: board.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
    eventId: 0, gdid: 'probe' + id, id, notetxt: txt, numord: id, sellist: 0, status: 0,
    text_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
  };
  allNotesData.push(nt);
  const el = await createNoteElement(nt);
  el.dataset.probe = String(id);
  // Извън истинския борд картата идва с inline display:none (бележката не е за показване) - тук я
  // правим видима, за да има реален layout, и на истинския борд тя е на екрана.
  el.style.display = 'flex';
  el.style.contentVisibility = 'visible';
  host.appendChild(el);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const card = document.querySelector(`.note[data-probe="${id}"]`);
  const content = card && card.querySelector('.note-content');
  if (!content) return { missing: true };
  // Първият ред на бележката е заглавие, затова линковете се търсят в цялата карта.
  const links = [...card.querySelectorAll('a, .nmd-link-elide')];
  const first = links[0] || null;
  const inContent = content.querySelector('a, .nmd-link-elide');
  const cardRect = card.getBoundingClientRect();
  const cr = content.getBoundingClientRect();
  const lr = inContent ? inContent.getBoundingClientRect() : null;
  const out = {
    anchors: card.querySelectorAll('a').length,
    elides: card.querySelectorAll('.nmd-link-elide').length,
    linkCount: links.length,
    text: content.textContent,
    cardText: card.textContent,
    firstText: first ? first.textContent : null,
    firstHref: first && first.tagName === 'A' ? first.getAttribute('href') : null,
    firstTag: first ? first.tagName : null,
    oneTap: localStorage.getItem('oneTapLink'),
    cardW: Math.round(cardRect.width), cardH: Math.round(cardRect.height),
    contentBox: { top: Math.round(cr.top), bottom: Math.round(cr.bottom), h: content.clientHeight, sh: content.scrollHeight },
    linkBox: lr ? { top: Math.round(lr.top), bottom: Math.round(lr.bottom), w: Math.round(lr.width), h: Math.round(lr.height) } : null,
    inside: lr ? (lr.top >= cr.top - 1 && lr.bottom <= cr.bottom + 1) : false,
  };
  el.remove();
  allNotesData.splice(allNotesData.indexOf(nt), 1);
  return out;
}, { txt, oneTap });

// Готовият HTML, който модалът получава (isForModal = true).
const modalHtml = (raw) => page.evaluate((raw) => {
  const div = document.createElement('div');
  div.innerHTML = getFormattedNoteHtml(raw, '', '', true);
  const links = [...div.querySelectorAll('a, .nmd-link-elide')];
  return {
    html: div.innerHTML,
    text: div.textContent,
    anchors: div.querySelectorAll('a').length,
    elides: div.querySelectorAll('.nmd-link-elide').length,
    linkTexts: links.map(l => l.textContent),
    linkHrefs: links.map(l => (l.tagName === 'A' ? l.getAttribute('href') : null)),
    checkboxes: div.querySelectorAll('input[type=checkbox]').length,
  };
}, raw);

// --- 1. Борд, one-tap ИЗКЛЮЧЕН, бележка A: един съкратен span, нула котви ---
const aBoard = await measureCard(NOTE_A, false);
ok(!aBoard.missing, 'A board: картата се рендира');
ok(aBoard.elides === 1 && aBoard.anchors === 0, `A board: един .nmd-link-elide и нула <a> (elide=${aBoard.elides}, a=${aBoard.anchors})`);
ok(!aBoard.cardText.includes('](') && !aBoard.cardText.includes('[charliehills'), `A board: няма „](“ и „[charliehills“ в текста (len=${aBoard.cardText.length})`);
ok(!!aBoard.firstText && aBoard.firstText.startsWith(A_SHOWN), `A board: текстът на линка започва с ${A_SHOWN} (${String(aBoard.firstText).slice(0, 70)})`);

// --- 2. Геометрия на бележка A: линкът е вътре в кутията на картата при 1280 и при 390 ---
for (const [W, H] of [[1280, 900], [390, 800]]) {
  await page.setViewportSize({ width: W, height: H });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const m = await measureCard(NOTE_A, false);
  ok(m.cardW === 250 && m.cardH === 250 && m.contentBox.h > 0 && !!m.linkBox && m.linkBox.w > 0,
    `A ${W}x${H}: картата е подредена (карта ${m.cardW}x${m.cardH}, съдържание h=${m.contentBox.h}, линк ${JSON.stringify(m.linkBox)})`);
  ok(m.inside, `A ${W}x${H}: линкът е във видимата кутия на картата (линк ${JSON.stringify(m.linkBox)} в кутия ${JSON.stringify(m.contentBox)})`);
}

// --- 3. Борд, one-tap ВКЛЮЧЕН: една котва с целия адрес от скобите ---
await page.setViewportSize({ width: 1280, height: 900 });
const aTap = await measureCard(NOTE_A, true);
ok(aTap.anchors === 1 && aTap.elides === 0, `A board+one-tap: точно една <a> (a=${aTap.anchors}, elide=${aTap.elides})`);
ok(aTap.firstHref === SUB_TARGET, `A board+one-tap: href е целият адрес от скобите (${String(aTap.firstHref).slice(0, 80)})`);
ok(!!aTap.firstText && aTap.firstText.startsWith(A_SHOWN), `A board+one-tap: текстът започва с ${A_SHOWN}`);

// --- 4. Бележка B (androidpolice) в двата режима ---
const bBoard = await measureCard(NOTE_B, false);
ok(bBoard.linkCount === 1 && bBoard.elides === 1 && bBoard.anchors === 0, `B board: един елемент, elide (count=${bBoard.linkCount}, elide=${bBoard.elides}, a=${bBoard.anchors})`);
ok(!!bBoard.firstText && String(bBoard.firstText).startsWith(B_SHOWN) && !bBoard.cardText.includes(']('), `B board: текстът е ${B_SHOWN} без „](“ (${String(bBoard.firstText).slice(0, 70)})`);
const bTap = await measureCard(NOTE_B, true);
ok(bTap.linkCount === 1 && bTap.anchors === 1 && bTap.firstHref === B_TARGET, `B board+one-tap: една котва с href от скобите (${String(bTap.firstHref).slice(0, 80)})`);
ok(!!bTap.firstText && String(bTap.firstText).startsWith(B_SHOWN) && !bTap.cardText.includes(']('), 'B board+one-tap: текстът е адресът без „](“');

// --- 5. Модалът за бележка A ---
const aModal = await modalHtml(NOTE_A);
ok(aModal.anchors === 1 && (aModal.html.match(/<a href=/g) || []).length === 1, `A modal: точно един <a href=> (anchors=${aModal.anchors}, a-href=${(aModal.html.match(/<a href=/g) || []).length})`);
ok(!aModal.text.includes('](') && !aModal.text.includes('[charliehills'), 'A modal: няма „](“ и „[charliehills“ в текста');
ok(aModal.linkTexts[0] === SUB.replace('https://', 'https://') && aModal.linkHrefs[0] === SUB_TARGET, `A modal: текст и href са целият адрес (text=${String(aModal.linkTexts[0]).slice(0, 60)}…)`);

// --- 6. Текстов етикет: модал -> котва, борд -> съкратен span ---
const labelModal = await modalHtml('[виж статията](https://example.com/a)');
ok(labelModal.anchors === 1 && labelModal.linkTexts[0] === 'виж статията' && labelModal.linkHrefs[0] === 'https://example.com/a',
  `етикет modal: котва „виж статията“ -> https://example.com/a (${JSON.stringify(labelModal.linkTexts)} ${JSON.stringify(labelModal.linkHrefs)})`);
// На борда: първият ред е заглавие (то е гол текст по начало), затова линкът е в тялото.
const labelBoard = await measureCard('Нещо за четене\n[виж статията](https://example.com/a)', false);
ok(labelBoard.anchors === 0 && labelBoard.elides === 1 && labelBoard.firstText === 'виж статията',
  `етикет board: един .nmd-link-elide с текста на етикета (a=${labelBoard.anchors}, elide=${labelBoard.elides}, text=${labelBoard.firstText})`);

// --- 7. [ ](…)/[x](…) не са линк ---
for (const raw of ['[ ](https://example.com)', '[x](https://example.com)']) {
  const m = await modalHtml(raw);
  ok(m.anchors === 0 && m.elides === 0 && m.text.trim() === raw, `не-линк ${raw}: остава гол текст (a=${m.anchors}, elide=${m.elides})`);
}

// --- 8. javascript: не става котва ---
const jsModal = await modalHtml('[клик](javascript:alert(1))');
ok(jsModal.anchors === 0 && jsModal.elides === 0 && jsModal.html.includes('[клик]'), `javascript: без котва и без elide (a=${jsModal.anchors}, elide=${jsModal.elides})`);

// --- 9. Отметките не се чупят ---
const cbModal = await modalHtml('[ ] задача\n[x] свършена');
ok(cbModal.checkboxes === 2, `отметки: две квадратчета (${cbModal.checkboxes})`);

// --- 10. Два линка на един ред, двата в реда си с техните href ---
const twoModal = await modalHtml('[едно](https://example.com/1) и [две](https://example.com/2)');
ok(twoModal.anchors === 2 && twoModal.linkHrefs[0] === 'https://example.com/1' && twoModal.linkHrefs[1] === 'https://example.com/2'
  && twoModal.linkTexts[0] === 'едно' && twoModal.linkTexts[1] === 'две',
  `два линка: ${JSON.stringify(twoModal.linkTexts)} ${JSON.stringify(twoModal.linkHrefs)}`);

// --- 11. Никакви грешки в конзолата / страницата ---
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);

await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
