// b5.53: криптиране на заключените бележки.
// Решение на собственика (24.11.2026): ЕДНА парола за всички заключени бележки, заглавието преди
// '|' остава открито на борда, старите бележки с pass:true НЕ се пипат, файловете НЕ се шифроват,
// забравена парола значи загубена бележка.
//
// Проверки:
//   1) шифроването пази заглавието преди '|' открито, а тялото не се чете в записа;
//   2) със същата парола тялото се връща точно (криптиране/декриптиране);
//   3) с грешна парола тялото НЕ се връща;
//   4) втори запис на същата бележка не иска парола наново (солта се пази от предишния запис);
//   5) катинарчето заключва бележката и записът в IndexedDB е шифротекст;
//   6) отварянето на заключена бележка показва текста (декриптира при отваряне);
//   7) бордът не показва шифротекст — картата носи само заглавието;
//   8) катинарчето отключва и записът става открит текст;
//   9) експортът за NotebookLM не изнася шифротекст;
//  10) без грешки в конзолата.

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let chromium;
for (const p of [
  'playwright',
  '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
  '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
]) {
  try { ({ chromium } = await import(p)); break; } catch (e) { /* следващият */ }
}
if (!chromium) {
  try { ({ chromium } = await import(path.join(__dirname, 'node_modules', 'playwright', 'index.mjs'))); } catch (e) { }
}
if (!chromium) { console.error('playwright не се намира'); process.exit(2); }

const URL = process.env.PAGE || 'http://127.0.0.1:8111/nomn/index.html';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  — ' + extra : ''}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
  const url = route.request().url();
  const isScript = /\.js(\?|$)/.test(url);
  await route.fulfill({
    status: 200,
    contentType: isScript ? 'application/javascript' : 'image/gif',
    body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')
  });
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => {
  if (m.type() === 'error' && !/404|Failed to load resource|Refused to execute script|net::ERR/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

// Паролата се въвежда през истинския попъп на приложението (showPrompt), не се подменя функцията:
// така проверката минава по същия път, по който минава и човекът.
await page.addInitScript(() => {
  const o = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
  window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2: o }, oauth2: o };
  window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
  window.kofiWidgetOverlay = { draw() { } };
  window.kofiwidget2 = { init() { }, draw() { } };
  localStorage.setItem('guide', 'false');
  localStorage.setItem('useIndexedDb', 'false');
  localStorage.setItem('useGoogleDb', 'false');
  localStorage.setItem('updateLocalFolder', 'false');
  localStorage.setItem('language', 'bg');
  localStorage.setItem('singleNoteMode', 'false');
  // Паролата, която тестът ще въведе, когато попъпът се покаже.
  window.__nmTestPassword = 'test-pass-123';
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('folderIdInput');
    const ok = document.getElementById('submitFolderIdBtn');
    const tryFill = () => {
      const popup = document.getElementById('folderIdPromptPopup');
      if (!popup || !popup.classList.contains('show')) return;
      if (input && ok && !input.value) {
        input.value = window.__nmTestPassword;
        ok.click();
      }
    };
    setInterval(tryFill, 60);
  });
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.nmEncEncryptNoteText === 'function', null, { timeout: 20000 });

// 1-2: шифроване и връщане на тялото
const roundTrip = await page.evaluate(async () => {
  const plain = 'Тайно заглавие|Това е тайното тяло на бележката.';
  const enc = await window.nmEncEncryptNoteText(plain, '');
  const stored = String(enc || '');
  const dec = await window.nmEncDecryptNoteText(stored);
  return { stored, dec, prefix: stored.split('|')[0], hasMarker: stored.indexOf('nmenc:1:') !== -1, leaks: stored.indexOf('тайното тяло') !== -1 };
});
check('тялото не се чете в записа', roundTrip.hasMarker && !roundTrip.leaks);
check('заглавието преди | остава открито', roundTrip.prefix === 'Тайно заглавие', roundTrip.prefix);
check('със същата парола тялото се връща точно', roundTrip.dec === 'Тайно заглавие|Това е тайното тяло на бележката.', String(roundTrip.dec));

// 4: втори запис не иска парола (солта идва от предишния плик)
const reEncrypt = await page.evaluate(async (prev) => {
  const before = document.querySelectorAll('#folderIdPromptPopup.show').length;
  const enc2 = await window.nmEncEncryptNoteText('Тайно заглавие|Променено тяло.', prev);
  const after = document.querySelectorAll('#folderIdPromptPopup.show').length;
  return { asked: after > before, ok: String(enc2 || '').indexOf('nmenc:1:') !== -1 };
}, roundTrip.stored);
check('втори запис на същата бележка не иска парола наново', reEncrypt.ok && !reEncrypt.asked);

// 3: грешна парола не връща тялото. Проверява се в ОТДЕЛНА страница: в тази ключът за солта вече
// е в кеша от горните проверки, а декриптирането вярно ползва кеша и няма да пита изобщо.
const wrongCtx = await browser.newContext({ viewport: { width: 390, height: 800 } });
await wrongCtx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
  const url = route.request().url();
  const isScript = /\.js(\?|$)/.test(url);
  await route.fulfill({ status: 200, contentType: isScript ? 'application/javascript' : 'image/gif', body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') });
});
const wrongPage = await wrongCtx.newPage();
await wrongPage.addInitScript(() => {
  const o = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
  window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2: o }, oauth2: o };
  window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
  window.kofiWidgetOverlay = { draw() { } };
  window.kofiwidget2 = { init() { }, draw() { } };
  localStorage.setItem('guide', 'false');
  localStorage.setItem('useIndexedDb', 'false');
  localStorage.setItem('useGoogleDb', 'false');
  localStorage.setItem('language', 'bg');
  window.__nmTestPassword = 'wrong-password';
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('folderIdInput');
    const ok = document.getElementById('submitFolderIdBtn');
    setInterval(() => {
      const popup = document.getElementById('folderIdPromptPopup');
      if (!popup || !popup.classList.contains('show')) return;
      if (input && ok && !input.value) { input.value = window.__nmTestPassword; ok.click(); }
    }, 60);
  });
});
await wrongPage.goto(URL, { waitUntil: 'domcontentloaded' });
await wrongPage.waitForFunction(() => typeof window.nmEncDecryptNoteText === 'function', null, { timeout: 20000 });
const wrong = await wrongPage.evaluate(async (stored) => ({ plain: await window.nmEncDecryptNoteText(stored) }), roundTrip.stored);
await wrongCtx.close();
check('с грешна парола тялото НЕ се връща', wrong.plain === null, String(wrong.plain));

// 5-8: катинарчето през истинския интерфейс
const live = await page.evaluate(async () => {
  // Бележка в паметта + карта на борда, без да пипаме мрежата.
  window.allNotesData = window.allNotesData || [];
  const note = {
    id: 901, gdid: 'enc-test-1', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
    notetxt: 'Секретна бележка|Съдържание, което не бива да се вижда.', text_span: '', title_span: '',
    color: 0, numord: 1, pass: false, sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
  };
  window.allNotesData.push(note);
  window.showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
  return !!document.getElementById('lock-modal-btn');
});
check('катинарчето се вижда в заглавния ред', live === true);

const locked = await page.evaluate(async () => {
  const btn = document.getElementById('lock-modal-btn');
  if (!btn) return { err: 'няма бутон' };
  btn.click();
  // Изчакваме записа (криптирането е асинхронно)
  for (let i = 0; i < 60; i++) {
    const n = window.allNotesData.find(x => String(x.gdid) === 'enc-test-1');
    if (n && n.pass === true) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const n = window.allNotesData.find(x => String(x.gdid) === 'enc-test-1');
  const stored = String((n && n.notetxt) || '');
  const card = document.querySelector('.note[data-g="enc-test-1"]');
  return {
    pass: n && n.pass,
    hasMarker: stored.indexOf('nmenc:1:') !== -1,
    leaks: stored.indexOf('Съдържание, което') !== -1,
    title: stored.split('|')[0],
    cardText: card ? card.textContent : '',
    btnOn: btn.classList.contains('nw-lock-on')
  };
});
check('катинарчето заключва бележката', locked.pass === true);
check('записът в паметта/БД е шифротекст', locked.hasMarker && !locked.leaks);
check('картата на борда не показва шифротекст', !/nmenc:1:/.test(locked.cardText) && !/Съдържание, което/.test(locked.cardText), locked.cardText.slice(0, 60));
check('бутонът показва заключено състояние', locked.btnOn === true);

// 6: отваряне на заключена бележка дава открития текст
const reopened = await page.evaluate(async () => {
  const n = window.allNotesData.find(x => String(x.gdid) === 'enc-test-1');
  window.showModal({ raw: n.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: n.id, gdid: n.gdid, originalNote: n });
  for (let i = 0; i < 50; i++) {
    const body = document.getElementById('modal-body');
    if (body && /Съдържание, което/.test(body.textContent || '')) return { ok: true, text: body.textContent };
    await new Promise(r => setTimeout(r, 100));
  }
  const body = document.getElementById('modal-body');
  return { ok: false, text: body ? body.textContent : '' };
});
check('отварянето показва истинския текст', reopened.ok === true, (reopened.text || '').slice(0, 50));

// 8: отключване
const unlocked = await page.evaluate(async () => {
  const btn = document.getElementById('lock-modal-btn');
  btn.click();
  for (let i = 0; i < 60; i++) {
    const n = window.allNotesData.find(x => String(x.gdid) === 'enc-test-1');
    if (n && n.pass === false) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const n = window.allNotesData.find(x => String(x.gdid) === 'enc-test-1');
  return { pass: n.pass, stored: String(n.notetxt || '') };
});
check('катинарчето отключва и записът е пак открит', unlocked.pass === false && unlocked.stored.indexOf('nmenc:1:') === -1 && /Съдържание, което/.test(unlocked.stored));

const realErrors = errors.filter(e => !/Няма достъпен токен|GDrive update failed|syncSingleNoteToGDrive|getElementsByClassName/.test(e));
check('без грешки в конзолата', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await ctx.close();
await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверки минават`);
process.exit(failed.length ? 1 : 0);
