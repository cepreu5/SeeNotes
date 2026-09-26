// extendedMode stays local to the device (variant B, b1.79). Run from repo root:
//   node .bolter/check/extended-mode-local.mjs            (exit 1 on any failed assertion)
//   BASE=f2c815b node .bolter/check/extended-mode-local.mjs   uses uni/main.js from that commit (expected to fail there)
// Static: (a) appSettingsKeys has no 'extendedMode'; (b) the profile-apply loop of loadSettingsFromGDrive, run on
// a fake localStorage, does not overwrite extendedMode from a profile snapshot.
// Live: real browser on uni/, profile cache settings_multinotes_data disagrees with localStorage; after the start-up
// loadSettingsFromGDrive(true) the header follows localStorage in both directions.
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const root = path.resolve('uni');
const BASE = process.env.BASE || '';
const mainSrc = BASE ? execFileSync('git', ['show', BASE + ':uni/main.js'], { maxBuffer: 64 << 20 }).toString() : await readFile(path.join(root, 'main.js'), 'utf8');
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };

// --- static ---
const keysSrc = mainSrc.match(/const appSettingsKeys = (\[[\s\S]*?\]);/);
ok(!!keysSrc, 'appSettingsKeys found in main.js');
const appSettingsKeys = eval(keysSrc[1]);
ok(!appSettingsKeys.includes('extendedMode'), "(a) appSettingsKeys does not contain 'extendedMode'");
ok(appSettingsKeys.includes('kbFabPosition') && appSettingsKeys.includes('zoomLevel'), 'appSettingsKeys still has its other keys', appSettingsKeys.length);

// the exact apply loop from loadSettingsFromGDrive, cut out of the source
const loopSrc = mainSrc.match(/            Object\.keys\(settings\)\.forEach\(key => \{\n                const isBoardKey[\s\S]*?\n            \}\);\n            initHeaderFullscreen\(\);/);
ok(!!loopSrc, 'profile-apply loop found in loadSettingsFromGDrive');
const store = { extendedMode: 'false', zoomLevel: '100' };
const localStorage = { setItem: (k, v) => { store[k] = String(v); }, getItem: k => store[k] ?? null };
const applyLoop = new Function('settings', 'appSettingsKeys', 'preservedKeys', 'localStorage', 'initHeaderFullscreen',
  loopSrc[0].replace(/\n\s*initHeaderFullscreen\(\);$/, ''));
applyLoop({ Default: { extendedMode: 'true' } }.Default, appSettingsKeys, [], localStorage, () => {});
ok(store.extendedMode === 'false', "(b) snapshot {extendedMode:'true'} leaves localStorage extendedMode='false'", store.extendedMode);
applyLoop({ zoomLevel: '130' }, appSettingsKeys, [], localStorage, () => {});
ok(store.zoomLevel === '130', 'other synced keys are still applied from the snapshot', store.zoomLevel);

// --- live ---
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const b = p === '/main.js' ? mainSrc : await readFile(path.join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store'}); res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(8793);
const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
for (const [local, snap, wantFs] of [['false', 'true', false], ['true', 'false', true]]) {
  const ctx = await browser.newContext();
  const snapshot = JSON.stringify({ Default: { deviceName: 'Default', language: 'bg', extendedMode: snap } });
  await ctx.addInitScript(({ local, snapshot }) => {
    if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('extendedMode', local); localStorage.setItem('deviceName', 'Default');
    localStorage.setItem('settings_multinotes_data', snapshot);
  }, { local, snapshot });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://localhost:8793/index.html');
  await page.waitForFunction(() => typeof loadSettingsFromGDrive === 'function' && document.querySelector('header'));
  await page.evaluate(() => loadSettingsFromGDrive(true)); // the call mainLogic makes at the end of start-up
  const st = await page.evaluate(() => ({ ls: localStorage.getItem('extendedMode'), fs: document.querySelector('header').classList.contains('header-fullscreen') }));
  ok(st.ls === local, `live local='${local}' snapshot='${snap}': localStorage stays '${local}'`, st);
  ok(st.fs === wantFs, `live local='${local}' snapshot='${snap}': header ${wantFs ? 'is' : 'is not'} header-fullscreen`, st);
  ok(errors.length === 0, `live local='${local}': no page errors`, errors.slice(0, 3));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(`${n - fails}/${n} passed${BASE ? ' (BASE=' + BASE + ')' : ''}`);
process.exit(fails ? 1 : 0);
