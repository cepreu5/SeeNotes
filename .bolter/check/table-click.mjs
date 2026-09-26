// Real click on ▦ in the edit modal. Run from repo root: node .bolter/check/table-click.mjs
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try { const b = await readFile(path.join(root, p === '/' ? 'index.html' : p)); res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8766);
const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => process.env.LOG && console.log('console:', m.text().slice(0, 160)));
await page.goto('http://localhost:8766/index.html');
await page.waitForFunction(() => typeof version !== 'undefined' && version && typeof startApp === 'function');
// No Google sign-in here: start the UI directly (initApp wires up the modal).
await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
await page.waitForFunction(() => contentModal, null, { timeout: 15000 });
const CS = '|Col1 header| Col 2|Col 3\n|-|-|-|\nText 1|Test|note 1\nnote 2|Text 2|Test';
await page.evaluate((raw) => showModal({ raw, id: 'tbl-check' }), 'Таблица\n' + CS);
await page.evaluate(() => enableNoteEditing(document.getElementById('modal-body')));
await page.waitForSelector('#note-edit-textarea');
const ta = () => page.evaluate(() => document.getElementById('note-edit-textarea').value);
const btn = page.locator('#content-modal .modal-edit-toolbar-btn.is-table');
await page.evaluate(() => { const t = document.getElementById('note-edit-textarea'); t.focus(); t.setSelectionRange(t.value.indexOf('Test'), t.value.indexOf('Test')); });
const fonts = () => page.evaluate(() => ({
  content: getComputedStyle(document.getElementById('note-edit-textarea')).fontFamily,
  backdrop: getComputedStyle(document.getElementById('note-edit-textarea-backdrop')).fontFamily,
  title: document.getElementById('note-edit-title-textarea') ? getComputedStyle(document.getElementById('note-edit-title-textarea')).fontFamily : null,
  active: document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table').classList.contains('is-active'),
  tip: document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table').title }));
console.log('version', await page.evaluate(() => version));
console.log('--- before\n' + await ta()); console.log(await fonts());
await page.screenshot({ path: '.bolter/check/fixed-font-before.png' });
await btn.click(); console.log('--- after 1 click\n' + await ta()); console.log(await fonts());
await page.screenshot({ path: '.bolter/check/fixed-font-after.png' });
await btn.click(); console.log('--- after 2 clicks\n' + await ta()); console.log(await fonts());
await btn.click(); console.log('--- 3rd click (fixed again), then reopen the note');
await page.evaluate((raw) => { showModal({ raw, id: 'tbl-check' }); enableNoteEditing(document.getElementById('modal-body')); }, 'Таблица\n' + CS);
console.log('reopened', await fonts());
await page.evaluate(() => { showModal({ raw: 'Без таблица\nсамо текст | с черта', id: 'plain' }); enableNoteEditing(document.getElementById('modal-body')); });
const plainBefore = await ta(); await btn.click();
console.log('no-table note: text unchanged', plainBefore === await ta(), await fonts());
await page.evaluate((raw) => { showModal({ raw, id: 'titled' }); enableNoteEditing(document.getElementById('modal-body')); }, 'Заглавие\nтекст\n' + CS);
const tBefore = await page.evaluate(() => document.getElementById('note-edit-title-textarea')?.value);
await btn.click();
console.log('titled note after press', await fonts(), 'title text same:', tBefore === await page.evaluate(() => document.getElementById('note-edit-title-textarea')?.value));
await page.screenshot({ path: '.bolter/check/fixed-font-titled.png' });
console.log('page errors', errors);
await browser.close(); srv.close();
