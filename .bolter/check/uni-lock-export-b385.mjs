// b3.85 (порт от nomn b5.53): експортът за NotebookLM не изнася шифротекст от заключена бележка.
// Проверки:
//   1) заключената бележка влиза само със заглавието си преди '|';
//   2) във файла НЯМА 'nmenc:1:' и НЯМА шифротекста;
//   3) има ред, който казва, че тялото е заключено;
//   4) тайното съдържание не е изтекло;
//   5) отключена бележка влиза с цялия си текст (контрола).

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let chromium;
for (const p of ['playwright', '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(p)); break; } catch (e) { }
}
if (!chromium) { console.error('playwright не се намира'); process.exit(2); }

const URL = process.env.PAGE || 'http://127.0.0.1:8110/uni/index.html';
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
  const url = route.request().url();
  const isScript = /\.js(\?|$)/.test(url);
  await route.fulfill({ status: 200, contentType: isScript ? 'application/javascript' : 'image/gif', body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => {
  const o = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
  window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2: o }, oauth2: o };
  window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
  window.kofiWidgetOverlay = { draw() { } };
  window.kofiwidget2 = { init() { }, draw() { } };
  localStorage.setItem('guide', 'false');
  localStorage.setItem('useIndexedDb', 'false');
  localStorage.setItem('useGoogleDb', 'false');
  localStorage.setItem('language', 'bg');
  // Паролата се въвежда през истинския попъп, иначе showPrompt чака вечно и тестът виси.
  window.__nmTestPassword = 'test-pass-123';
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('folderIdInput');
    const ok = document.getElementById('submitFolderIdBtn');
    setInterval(() => {
      const popup = document.getElementById('folderIdPromptPopup');
      if (!popup || !popup.classList.contains('show')) return;
      const input = document.getElementById('folderIdInput'); // b5.72: полето се пресъздава при всяко отваряне, затова се търси наново
      if (input && ok && !input.value) { input.value = window.__nmTestPassword; ok.click(); }
    }, 60);
  });
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.nmEncEncryptNoteText === 'function' && typeof window.exportNotesToMarkdown === 'function', null, { timeout: 25000 });

// Изтеглянето се прихваща в страницата: така тестът не зависи от download plumbing.
const out = await page.evaluate(async () => {
  const encText = await window.nmEncEncryptNoteText('Заключено заглавие|Страшно тайно съдържание', '');
  // Масивите се ПРОМЕНЯТ, не се подменят: експортът чете същия масив, който приложението държи.
  window.boardsData.length = 0;
  window.boardsData.push({ gdid: 'b1', id: 1, title: 'Работа', status: 0 });
  window.allNotesData.length = 0;
  window.allNotesData.push(
    { id: 1, gdid: 'n1', boardid: 'b1', status: 0, date: 1763000000000, pass: true, notetxt: encText, text_span: '', title_span: '', color: 0 },
    { id: 2, gdid: 'n2', boardid: 'b1', status: 0, date: 1763000001000, pass: false, notetxt: 'Открито заглавие|Открито съдържание', text_span: '', title_span: '', color: 0 }
  );
  let captured = null;
  const original = window.downloadAsFile;
  window.downloadAsFile = (name, content) => { captured = { name, content: String(content) }; };
  try {
    await window.exportNotesToMarkdown();
  } finally {
    window.downloadAsFile = original;
  }
  return { captured, encText };
});

const text = (out.captured && out.captured.content) || '';
const cipherPart = String(out.encText || '').split('nmenc:1:')[1] || '';

check('файлът е изтеглен', !!out.captured && text.length > 0, out.captured ? out.captured.name : 'няма файл');
check('заключената бележка е със заглавието си', text.includes('Заключено заглавие'));
check('във файла няма маркер на плика', !text.includes('nmenc:1:'));
check('във файла няма шифротекст', cipherPart.length > 20 && !text.includes(cipherPart.slice(0, 40)));
check('казано е, че тялото е заключено', /заключено/.test(text));
check('тайното съдържание не е изтекло', !text.includes('Страшно тайно съдържание'));
check('отключената бележка влиза с текста си', text.includes('Открито съдържание'));
check('без грешки', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверки минават`);
process.exit(failed.length ? 1 : 0);
