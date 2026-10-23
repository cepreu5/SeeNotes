// Ред, който е САМО линк, не става заглавие на картата (23.10.2026, пети доклад на собственика):
// „На едната снимка е реалната съдържание на бележка в която има снимка и линк от нея, на другата е
// как тази бележка се показва в борда - неправилно, линкът се взима като заглавие, поправи го".
// Проверява се по ИСТИНСКИЯ път на картата (createNoteElement), не по пресметнато правило:
//   - гол адрес на първия ред + снимка на втория: заглавие НЯМА (скрито, нито „...", нито адреса),
//     а линкът и снимката се виждат в тялото;
//   - гол адрес + ред с думи: заглавие е редът с думите, адресът остава в тялото като линк;
//   - markdown линк [етикет](адрес) на първия ред: не е заглавие - линкът се вижда в тялото;
//   - контрола: обикновена бележка „Първи ред\nвтори ред" -> заглавие „Първи ред".
// Пуска се от корена на хранилището:
//   node .bolter/check/link-only-title.mjs      (exit 1 при провалена проверка)
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
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
  if (!cond) fails++;
};

// --- Фалшив Drive за вградената снимка (type=8): име -> файл -> thumbnailLink -> картинка ---
const SMALL = 'file_0000.png';
const SMALL_ID = 'FILE0000';
const IMG = '/storage/emulated/0/Pictures/Images/' + SMALL;
const WIDE = 300;

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
// Нищо извън localhost: gsi клиентът получава празен заместител, за да не гърми app-ът.
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const u = new URL(url);
    const q = u.searchParams.get('q') || '';
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    const fileIdMatch = url.match(/\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
    if (fileIdMatch) {
      const fileId = decodeURIComponent(fileIdMatch[1]);
      if (fileId !== SMALL_ID) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s800` }) });
    }
    if (name === SMALL) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: SMALL_ID, name: SMALL, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
    }
    const looksFolder = /vnd\.google-apps\.folder/.test(q);
    if (looksFolder) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDE}" height="225"><rect width="${WIDE}" height="225" fill="#c6d2e4"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
await ctx.addInitScript(() => {
  window.gapi = {
    load() { },
    client: {
      setToken() { }, getToken() { return { access_token: 'tok' }; },
      drive: {
        files: {
          list() { return Promise.resolve({ result: { files: [] } }); },
          get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); },
        },
      },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
  localStorage.setItem('language', 'bg');
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof createNoteElement === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));

// Връща измерванията за карта на борда, построена през истинския createNoteElement.
// format е text_span на бележката - така вградената снимка (type=8) е на мястото на маркера си.
const measureCard = (txt, format, oneTap) => page.evaluate(async ({ txt, format, oneTap }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  localStorage.setItem('oneTapLink', oneTap ? 'true' : 'false');
  // Картата се слага в собствен видим контейнер: #notes-container е с височина 0 и картите в него
  // не се подреждат (content-visibility: auto ги пропуска) - тогава геометрията е 0x0.
  let host = document.getElementById('link-title-probe-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'link-title-probe-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:640px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;z-index:99999;background:#fff;';
    document.body.appendChild(host);
  }
  const board = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  const id = 900000 + Math.floor(Math.random() * 90000);
  const nt = {
    alarm_type: -1, boardid: board.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
    eventId: 0, gdid: 'probe' + id, id, notetxt: txt, numord: id, sellist: 0, status: 0,
    text_span: format || '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
  };
  allNotesData.push(nt);
  const el = await createNoteElement(nt);
  el.dataset.probe = String(id);
  // Извън истинския борд картата идва с inline display:none (бележката не е за показване) - тук я
  // правим видима, за да има реален layout, и на истинския борд тя е на екрана.
  el.style.display = 'flex';
  el.style.contentVisibility = 'visible';
  host.appendChild(el);
  // Рамката на вградената снимка се пълни по мрежата: изчаква се да излезе от „loading" (или да
  // се провали) - иначе снимката не се брои за нищо.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const frames = [...el.querySelectorAll('.nm-inline-img')];
    if (!frames.length || frames.every(f => f.dataset.nmState && f.dataset.nmState !== 'loading')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const card = document.querySelector(`.note[data-probe="${id}"]`);
  const titleEl = card && card.querySelector('.note-title-truncated');
  const content = card && card.querySelector('.note-content');
  if (!content) {
    el.remove();
    allNotesData.splice(allNotesData.indexOf(nt), 1);
    return { missing: true };
  }
  // Тялото по редове: <br> се брои за интервал, иначе съседните думи се слепват в textContent.
  const contentOf = (el2) => {
    const clone = el2.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode(' ')));
    return clone.textContent.replace(/\s+/g, ' ').trim();
  };
  const links = [...content.querySelectorAll('a, .nmd-link-elide')];
  const frames = [...content.querySelectorAll('.nm-inline-img[data-nm-file]')];
  // Всички листови елементи в КАРТАТА, чийто текст започва с адреса: така се вижда дали адресът
  // стои някъде извън тялото (напр. в заглавието), или само като линк в тялото.
  const urlLeaves = [...card.querySelectorAll('*')]
    .filter(el => el.children.length === 0 && el.textContent.trim().startsWith('https://youtu.be'))
    .map(el => el.tagName.toLowerCase() + (content.contains(el) ? ':in-body' : ':OUTSIDE-BODY'));
  // Боядисан ред: има ли в тялото span с фон (type=5) - доказателство, че прикритият ред се рисува.
  const paintedBg = [...content.querySelectorAll('span[style*="background-color"]')]
    .map(el => (el.getAttribute('style') || '').match(/background-color:\s*([^;"]+)/i))
    .filter(Boolean).map(m => m[1].trim());
  // Редът на съдържанието в тялото: 'img' / 'link' / 'text', по документен ред. По него се вижда
  // дали снимката стои НАЙ-ГОРЕ в тялото.
  const bodyOrder = [...content.querySelectorAll('*')]
    .filter(el => el.classList.contains('nm-inline-img') || el.matches('a, .nmd-link-elide') || (el.children.length === 0 && el.textContent.trim()))
    .map(el => el.classList.contains('nm-inline-img') ? 'img' : (el.matches('a, .nmd-link-elide') ? 'link' : 'text'))
    .filter((kind, i, all) => !(kind === 'text' && all[i - 1] === 'text'));
  const cardRect = card.getBoundingClientRect();
  const cr = content.getBoundingClientRect();
  const out = {
    titleText: titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : null,
    titleDisplay: titleEl ? getComputedStyle(titleEl).display : null,
    titleHtml: titleEl ? titleEl.innerHTML.slice(0, 200) : null,
    cardText: card.textContent.replace(/\s+/g, ' ').trim(),
    contentText: contentOf(content),
    anchors: content.querySelectorAll('a').length,
    elides: content.querySelectorAll('.nmd-link-elide').length,
    linkCount: links.length,
    linkTexts: links.map(l => l.textContent),
    linkHrefs: links.map(l => (l.tagName === 'A' ? l.getAttribute('href') : null)),
    frames: frames.length,
    frameStates: frames.map(f => f.dataset.nmState || null),
    urlLeaves,
    paintedBg,
    bodyOrder,
    // Знакът на маркера на снимката не бива да се вижда като текст.
    markerChar: content.textContent.includes('*') ? 'star' : 'no-star',
    oneTap: localStorage.getItem('oneTapLink'),
    cardW: Math.round(cardRect.width), cardH: Math.round(cardRect.height),
    contentH: content.clientHeight,
  };
  el.remove();
  allNotesData.splice(allNotesData.indexOf(nt), 1);
  return out;
}, { txt, format, oneTap });

// Форматът на вградената снимка: един знак (маркерът „*") в координатите на ЦЕЛИЯ текст.
const span8 = (start, end, paramstring, paramint) => JSON.stringify({ start, end, type: 8, paramstring, paramint });
const imageFormatAt = (raw, marker = '*', paramint = 3) => {
  const at = raw.indexOf(marker);
  if (at < 0) throw new Error('маркерът липсва в текста: ' + raw);
  return span8(at, at + 1, IMG, paramint);
};

const URL1 = 'https://youtu.be/QTO1abc';

// --- 1. Гол адрес на първия ред + снимка на втория (докладът на собственика) ---
const noteImg = URL1 + '\n*';
const imgCard = await measureCard(noteImg, imageFormatAt(noteImg), false);
ok(!imgCard.missing, 'адрес+снимка: картата се рендира', imgCard);
ok(imgCard.titleDisplay === 'none' || !imgCard.titleText,
  `адрес+снимка: заглавието е СКРИТО (display ${imgCard.titleDisplay}, текст „${imgCard.titleText}")`, imgCard);
ok(!String(imgCard.titleText || '').includes('youtu.be') && !String(imgCard.titleText || '').includes('https://'),
  `адрес+снимка: в заглавието няма адрес („${imgCard.titleText}")`, imgCard);
ok(String(imgCard.titleText || '') !== '...', `адрес+снимка: заглавието не е „..." („${imgCard.titleText}")`, imgCard);
ok(imgCard.linkCount === 1 && String(imgCard.linkTexts[0]).startsWith(URL1),
  `адрес+снимка: в тялото има ТОЧНО един линк и той е адресът (${imgCard.linkCount}: ${JSON.stringify(imgCard.linkTexts)})`, imgCard);
ok(imgCard.elides === 1 && imgCard.anchors === 0,
  `адрес+снимка: без one-tap линкът е съкратеният span (elide=${imgCard.elides}, a=${imgCard.anchors})`, imgCard);
ok(imgCard.frames === 1, `адрес+снимка: снимката е в тялото, до линка (${imgCard.frames} рамки)`, imgCard);
ok(imgCard.markerChar === 'no-star', `адрес+снимка: знакът на маркера не се вижда (${imgCard.markerChar})`, imgCard);
ok(imgCard.contentH > 0 && imgCard.cardW > 0, `адрес+снимка: картата е подредена (${imgCard.cardW}x${imgCard.cardH}, тяло ${imgCard.contentH})`, imgCard);

// Същата бележка с one-tap: линкът става котва с целия адрес.
const imgTap = await measureCard(noteImg, imageFormatAt(noteImg), true);
ok(imgTap.linkCount === 1 && imgTap.anchors === 1 && String(imgTap.linkHrefs[0]).startsWith(URL1),
  `адрес+снимка + one-tap: една котва с адреса (a=${imgTap.anchors}, href=${String(imgTap.linkHrefs[0]).slice(0, 60)})`, imgTap);
ok(imgTap.titleDisplay === 'none' || !imgTap.titleText,
  `адрес+снимка + one-tap: заглавието пак е скрито (display ${imgTap.titleDisplay}, „${imgTap.titleText}")`, imgTap);

// --- 2. Гол адрес + ред с думи: заглавие е редът с думите, адресът остава в тялото ---
const noteWords = URL1 + '\nИстинско заглавие';
const wordsCard = await measureCard(noteWords, '', false);
ok(wordsCard.titleText === 'Истинско заглавие',
  `адрес+думи: заглавието е „Истинско заглавие" („${wordsCard.titleText}")`, wordsCard);
ok(wordsCard.titleDisplay !== 'none', `адрес+думи: заглавието се вижда (display ${wordsCard.titleDisplay})`, wordsCard);
ok(wordsCard.linkCount === 1 && String(wordsCard.linkTexts[0]).startsWith(URL1),
  `адрес+думи: адресът се вижда в тялото като линк (${JSON.stringify(wordsCard.linkTexts)})`, wordsCard);
ok(!String(wordsCard.titleText || '').includes('youtu.be'), 'адрес+думи: в заглавието няма адрес', wordsCard);

// --- 3. Markdown линк на първия ред не е заглавие ---
const noteMd = '[виж статията](https://example.com/a)';
const mdCard = await measureCard(noteMd, '', false);
ok(mdCard.titleDisplay === 'none' || !mdCard.titleText,
  `markdown линк сам: заглавие няма (display ${mdCard.titleDisplay}, „${mdCard.titleText}")`, mdCard);
ok(!String(mdCard.titleText || '').includes('](') && !String(mdCard.titleText || '').includes('example.com'),
  `markdown линк сам: заглавието не е линкът и не съдържа „](" („${mdCard.titleText}")`, mdCard);
ok(mdCard.linkCount === 1 && mdCard.linkTexts[0] === 'виж статията',
  `markdown линк сам: линкът се вижда в тялото с етикета си (${JSON.stringify(mdCard.linkTexts)})`, mdCard);

// Същият линк, но след него има ред с думи: заглавие е редът с думите.
const mdWords = noteMd + '\nПосле четем';
const mdWordsCard = await measureCard(mdWords, '', false);
ok(mdWordsCard.titleText === 'После четем',
  `markdown линк + думи: заглавието е „После четем" („${mdWordsCard.titleText}")`, mdWordsCard);
ok(mdWordsCard.linkCount === 1 && mdWordsCard.linkTexts[0] === 'виж статията',
  `markdown линк + думи: линкът остава в тялото (${JSON.stringify(mdWordsCard.linkTexts)})`, mdWordsCard);

// Формата, която app-ът сам произвежда при поставяне на линк: „https://[етикет](адрес)".
const noteAppMd = 'https://[www.example.com/a](http://www.example.com/a)\nСледващ ред с думи';
const appMdCard = await measureCard(noteAppMd, '', false);
ok(appMdCard.titleText === 'Следващ ред с думи',
  `app линк + думи: заглавието е редът с думите („${appMdCard.titleText}")`, appMdCard);
ok(appMdCard.linkCount === 1 && String(appMdCard.linkTexts[0]).startsWith('https://www.example.com/a'),
  `app линк + думи: линкът е в тялото без „](" (${JSON.stringify(appMdCard.linkTexts)})`, appMdCard);
ok(!appMdCard.cardText.includes(']('), 'app линк + думи: в картата няма „]("', appMdCard);

// --- 4. Контрола: обикновена бележка не е счупена ---
const plainCard = await measureCard('Първи ред\nвтори ред', '', false);
ok(plainCard.titleText === 'Първи ред',
  `контрола: заглавието е „Първи ред" („${plainCard.titleText}")`, plainCard);
ok(String(plainCard.contentText).includes('втори ред'),
  `контрола: тялото е вторият ред („${plainCard.contentText}")`, plainCard);

// --- 5. ЗАДЪЛЖИТЕЛНО: триредовата бележка от доклада на собственика (23.10.2026, 17:21) ---
// Ред 1 - само вградена снимка (type=8), ред 2 - ПРИКРИТ (боядисан) ред „НАРОДЪТ, КОЙТО ЗАГУБИ
// ИМЕТО, ЕЗИКА И ЕЛИТА СИ.", ред 3 - само линк. Картата трябва да е БЕЗ заглавие, снимката най-
// горе в тялото, а линкът - в тялото, видим и кликаем.
const HIDDEN_SENTENCE = 'НАРОДЪТ, КОЙТО ЗАГУБИ ИМЕТО, ЕЗИКА И ЕЛИТА СИ.';
const URL2 = 'https://youtu.be/QTO1sLqi0VY';
const noteReport = '*' + '\n' + HIDDEN_SENTENCE + '\n' + URL2;
const sentenceStart = noteReport.indexOf(HIDDEN_SENTENCE);
const sentenceEnd = sentenceStart + HIDDEN_SENTENCE.length;
// Прикритият ред: светъл текст (type=4) върху тъмен фон (type=5) - точно черният блок от снимката.
const reportFormat = [
  span8(0, 1, IMG, 3),
  JSON.stringify({ start: sentenceStart, end: sentenceEnd, type: 4, paramint: 0xFFF0F0F0 }),
  JSON.stringify({ start: sentenceStart, end: sentenceEnd, type: 5, paramint: 0xFF0F0F0F }),
].join('|');

const reportCard = await measureCard(noteReport, reportFormat, false);
ok(!reportCard.missing, 'докладът: картата се рендира', reportCard);
ok(reportCard.titleDisplay === 'none' || !reportCard.titleText,
  `докладът: заглавието е СКРИТО/празно (display ${reportCard.titleDisplay}, „${reportCard.titleText}")`, reportCard);
ok(!String(reportCard.titleText || '').includes('youtu.be') && !String(reportCard.titleText || '').includes('http'),
  `докладът: заглавието не е адресът („${reportCard.titleText}")`, reportCard);
ok((reportCard.urlLeaves || []).length === 1 && reportCard.urlLeaves[0] === 'span:in-body',
  `докладът: адресът съществува в картата САМО като линков елемент в тялото (${JSON.stringify(reportCard.urlLeaves)})`, reportCard);
ok(reportCard.linkCount === 1 && String(reportCard.linkTexts[0]).startsWith(URL2),
  `докладът: линкът е в тялото и е адресът (${JSON.stringify(reportCard.linkTexts)})`, reportCard);
ok(reportCard.frames === 1, `докладът: снимката е в картата (${reportCard.frames} рамки)`, reportCard);
ok((reportCard.paintedBg || []).length > 0,
  `докладът: прикритият ред се рисува като боядисан блок (${JSON.stringify(reportCard.paintedBg)})`, reportCard);
ok(String(reportCard.bodyOrder).startsWith('img'),
  `докладът: снимката е НАЙ-ГОРЕ в тялото, а линкът след нея (${JSON.stringify(reportCard.bodyOrder)})`, reportCard);
ok(reportCard.titleHtml === null || !reportCard.titleHtml.includes('youtu.be'),
  `докладът: в HTML-а на заглавието няма адрес (${String(reportCard.titleHtml).slice(0, 60)})`, reportCard);

// Същата бележка с one-tap: линкът става котва, а заглавие пак няма.
const reportTap = await measureCard(noteReport, reportFormat, true);
ok(reportTap.linkCount === 1 && reportTap.anchors === 1 && String(reportTap.linkHrefs[0]).startsWith(URL2),
  `докладът + one-tap: една котва с адреса (a=${reportTap.anchors}, href=${String(reportTap.linkHrefs[0]).slice(0, 50)})`, reportTap);
ok(reportTap.titleDisplay === 'none' || !reportTap.titleText,
  `докладът + one-tap: заглавието пак е скрито (display ${reportTap.titleDisplay}, „${reportTap.titleText}")`, reportTap);

// Прикрит ред с цвят, РАВЕН на фона си (нечетим) - също не става заглавие, а заглавие става
// следващият ред с истински думи.
const noteConcealed = HIDDEN_SENTENCE + '\nИстинско заглавие след прикрития ред';
const concealedFormat = JSON.stringify({ start: 0, end: HIDDEN_SENTENCE.length, type: 4, paramint: 0xFFFF0000 })
  + '|' + JSON.stringify({ start: 0, end: HIDDEN_SENTENCE.length, type: 5, paramint: 0xFFFF0000 });
const concealedCard = await measureCard(noteConcealed, concealedFormat, false);
ok(concealedCard.titleText === 'Истинско заглавие след прикрития ред',
  `прикрит ред (цвят = фон): заглавие е редът с думите („${concealedCard.titleText}")`, concealedCard);
ok(!String(concealedCard.titleText || '').includes('НАРОДЪТ'),
  'прикрит ред (цвят = фон): прикритият ред не е заглавие', concealedCard);

// Боядисан ред САМ (без друг ред с думи): заглавие няма, а редът се вижда в тялото както е боядисан.
const onlyConcealed = HIDDEN_SENTENCE + '\n' + URL2;
const onlyConcealedFormat = JSON.stringify({ start: 0, end: HIDDEN_SENTENCE.length, type: 4, paramint: 0xFFF0F0F0 })
  + '|' + JSON.stringify({ start: 0, end: HIDDEN_SENTENCE.length, type: 5, paramint: 0xFF0F0F0F });
const onlyConcealedCard = await measureCard(onlyConcealed, onlyConcealedFormat, false);
ok(onlyConcealedCard.titleDisplay === 'none' || !onlyConcealedCard.titleText,
  `само боядисан ред + линк: заглавие няма (display ${onlyConcealedCard.titleDisplay}, „${onlyConcealedCard.titleText}")`, onlyConcealedCard);
ok(onlyConcealedCard.linkCount === 1 && String(onlyConcealedCard.linkTexts[0]).startsWith(URL2),
  `само боядисан ред + линк: линкът е в тялото (${JSON.stringify(onlyConcealedCard.linkTexts)})`, onlyConcealedCard);

// --- 7. Прикрит ред само с ТЪМЕН фон (обикновеният черен текст върху него е нечетим) ---
const darkBgFormat = JSON.stringify({ start: 0, end: HIDDEN_SENTENCE.length, type: 5, paramint: 0xFF202020 });
const darkBgCard = await measureCard(noteConcealed, darkBgFormat, false);
ok(darkBgCard.titleText === 'Истинско заглавие след прикрития ред',
  `прикрит ред (само тъмен фон): заглавие е редът с думите („${darkBgCard.titleText}")`, darkBgCard);

// --- 8. Обратното: ОБИКНОВЕН цветен ред остава заглавие (правилото не е прекалено широко) ---
const noteColored = 'Цветно заглавие\nвтори ред';
for (const [what, fmt] of [
  ['само цвят на текста', JSON.stringify({ start: 0, end: 7, type: 4, paramint: 0xFFB00020 })],
  ['само светъл фон', JSON.stringify({ start: 0, end: 7, type: 5, paramint: 0xFFFBFF86 })],
]) {
  const m = await measureCard(noteColored, fmt, false);
  ok(m.titleText === 'Цветно заглавие',
    `обикновен ред със ${what}: пак е заглавие („${m.titleText}")`, m);
}

// --- 9. Никакви грешки в конзолата / страницата ---
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);

await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
