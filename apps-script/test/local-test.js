#!/usr/bin/env node
/**
 * Локален тест за notes-api.gs — чист Node, без зависимости.
 *
 * Глобалните обекти на Apps Script (DriveApp, PropertiesService,
 * ContentService, Utilities) са фалшиви и четат от test/fixtures/:
 * всяка подпапка на fixtures/multinotes_data е един "Drive файл", името на
 * подпапката е неговото Drive ID, а вътре е note.txt или board.txt.
 *
 * Фалшивият Drive хвърля грешка при всеки опит за запис — така тестът
 * доказва и че endpoint-ът е само за четене. Фалшивият UrlFetchApp.fetchAll
 * отговаря САМО на GET заявки за `drive/v3/files/<id>?alt=media` (съдържанието
 * идва от същите fixtures) и хвърля при всичко друго — гаранцията за само
 * четене важи и за пакетното четене. Освен това разпознава (пак само GET)
 * пълнотекстовото търсене `drive/v3/files?q=...` (симулира индекса на Drive
 * върху същите fixtures, само при opts.index) и `drive/v3/about?fields=user`
 * (само при opts.driveAccount); без тези опции двата адреса връщат 403.
 *
 * Пускане: node apps-script/test/local-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const GS_PATH = path.join(__dirname, '..', 'notes-api.gs');
const FIXTURES = path.join(__dirname, 'fixtures');
const TOKEN = crypto.randomBytes(18).toString('hex'); // Генерира се при всяко пускане

// ---------------------------------------------------------------------------
// Фалшив Drive (само четене)
// ---------------------------------------------------------------------------

const writeAttempts = [];

/** Обект, който хвърля при извикване на метод, който не е изрично разрешен. */
function readOnly(name, methods) {
    return new Proxy(methods, {
        get(target, prop) {
            if (prop in target || typeof prop === 'symbol' || prop === 'then') return target[prop];
            return () => {
                writeAttempts.push(`${name}.${String(prop)}`);
                throw new Error(`Write/unknown method called: ${name}.${String(prop)}`);
            };
        }
    });
}

function iterator(items) {
    let i = 0;
    return readOnly('Iterator', {
        hasNext: () => i < items.length,
        next: () => items[i++]
    });
}

/**
 * `store` е общ за контекста: Drive ID -> четене на съдържанието. От него
 * четат и DriveApp (getBlob), и фалшивият UrlFetchApp.
 */
function fakeFile(id, name, read, store) {
    store.contents[id] = read;
    return store.files[id] = readOnly('File', {
        getId: () => id,
        getName: () => name,
        isTrashed: () => false,
        getBlob: () => readOnly('Blob', {
            getDataAsString: () => { store.blobReads++; return read(); }
        })
    });
}

function fakeFolder(folderName, store, synthetic) {
    const dir = path.join(FIXTURES, folderName);
    const files = fs.readdirSync(dir).sort().flatMap(id =>
        fs.readdirSync(path.join(dir, id)).map(name => {
            const fullPath = path.join(dir, id, name);
            return fakeFile(id, name, () => fs.readFileSync(fullPath, 'utf8'), store);
        }));
    // По избор: още N синтетични note.txt (за да се види разделянето на партиди)
    for (let i = 0; i < (synthetic || 0); i++) {
        const id = 'synthetic/' + String(i).padStart(3, '0'); // `/` проверява encodeURIComponent
        const body = JSON.stringify({ id: 9000 + i, boardid: 'bIdei', notetxt: 'Синтетична бележка ' + i + '|текст', date: 1767225600000, datemod: 1767225600000, status: 0 });
        files.push(fakeFile(id, 'note.txt', () => body, store));
    }
    store.folderNotes['folder-' + folderName] = files.filter(f => f.getName() === 'note.txt').map(f => f.getId());
    return readOnly('Folder', {
        getName: () => folderName,
        getId: () => 'folder-' + folderName,
        isTrashed: () => false,
        getFilesByName: name => iterator(files.filter(f => f.getName() === name))
    });
}

const OAUTH_TOKEN = 'ya29.fake-' + crypto.randomBytes(8).toString('hex');
const MEDIA_URL = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?#]+)\?alt=media&supportsAllDrives=true$/;
const LIST_URL = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\?([^#]+)$/;
const ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user';

/**
 * Симулация на `fullText contains` на Drive: файлът е кандидат, ако суровото
 * му съдържание съдържа всяка дума (без значение от регистъра). Като истинския
 * индекс, НЕ знае за скрити бележки / Кошче на приложението — затова
 * съвпадението трябва да се провери наново от скрипта.
 */
function fakeIndex(store, opts, query) {
    if (opts.index === 'empty') return [];
    const parent = /^'((?:[^'\\]|\\.)*)' in parents and name = 'note\.txt' and trashed = false/.exec(query);
    if (!parent) return null;
    const unescape = t => t.replace(/\\(.)/g, '$1');
    const terms = [...query.matchAll(/fullText contains '((?:[^'\\]|\\.)*)'/g)].map(m => unescape(m[1]).toLowerCase());
    const ids = store.folderNotes[unescape(parent[1])] || [];
    return ids.filter(id => { const c = store.contents[id]().toLowerCase(); return terms.every(t => c.includes(t)); })
        .map(id => ({ id, name: 'note.txt' }));
}

function jsonResponse(code, body, throws) {
    return {
        getResponseCode: () => { if (throws) throw new Error('response exploded'); return code; },
        getContentText: () => JSON.stringify(body)
    };
}

/**
 * Фалшив UrlFetchApp: само fetchAll, само GET, само media изтегляне на
 * файл от fixtures. Всичко друго (друг URL, POST/PATCH/DELETE, payload,
 * fetch() вместо fetchAll()) се записва в writeAttempts и хвърля.
 */
function fakeUrlFetchApp(store, opts) {
    return readOnly('UrlFetchApp', {
        fetchAll: requests => {
            const reqs = requests.map(req => (typeof req === 'string' ? { url: req } : req));
            const media = reqs.filter(r => MEDIA_URL.test(String(r.url))).length;
            // fetchAllCalls брои само media изтеглянията (индексът и about се броят отделно)
            if (media) store.fetchAllCalls.push(media);
            if (opts.fetchAllThrows) throw new Error('fetchAll exploded');
            if (media && store.clock) store.clock.t += opts.batchCostMs || 0;
            return reqs.map(r => {
                const method = String(r.method || 'get').toLowerCase();
                const auth = r.headers && r.headers.Authorization;
                const okAuth = auth === 'Bearer ' + OAUTH_TOKEN;
                const list = LIST_URL.exec(String(r.url));
                if (method === 'get' && r.payload === undefined && String(r.url) === ABOUT_URL) {
                    store.aboutCalls.push(requests.length);
                    if (!okAuth) return jsonResponse(401, {});
                    if (opts.driveAccount === undefined) return jsonResponse(403, {});
                    return jsonResponse(200, { user: { emailAddress: opts.driveAccount } }, opts.aboutThrows);
                }
                if (method === 'get' && r.payload === undefined && list) {
                    const qs = new URLSearchParams(list[1]);
                    store.indexCalls.push({ q: qs.get('q'), fields: qs.get('fields'), pageSize: qs.get('pageSize'), auth, batch: requests.length });
                    if (!okAuth) return jsonResponse(401, {});
                    if (!opts.index) return jsonResponse(403, { error: 'index disabled in fake' });
                    const files = fakeIndex(store, opts, qs.get('q'));
                    return files ? jsonResponse(200, { files }) : jsonResponse(400, { error: 'bad query' });
                }
                const m = MEDIA_URL.exec(String(r.url));
                if (method !== 'get' || r.payload !== undefined || !m) {
                    writeAttempts.push(`UrlFetchApp.fetchAll(${method} ${r.url})`);
                    throw new Error(`Non-read request: ${method} ${r.url}`);
                }
                const id = decodeURIComponent(m[1]);
                let code = 200;
                if (auth !== 'Bearer ' + OAUTH_TOKEN) code = 401;
                else if (!(id in store.contents)) code = 404;
                else if ((opts.failIds || []).indexOf(id) >= 0) code = 500;
                if (code === 200) store.mediaReads++;
                return {
                    getResponseCode: () => code,
                    getContentText: () => (code === 200 ? store.contents[id]() : '{"error":' + code + '}')
                };
            });
        }
    });
}

function makeContext(opts = {}) {
    const props = { API_TOKEN: opts.noToken ? null : TOKEN };
    const store = { contents: {}, files: {}, folderNotes: {}, blobReads: 0, mediaReads: 0, fetchAllCalls: [], indexCalls: [], aboutCalls: [] };
    const logs = [];
    const logFn = (...a) => logs.push(a.map(String).join(' '));
    const folderQueries = [];
    const ctx = {
        DriveApp: readOnly('DriveApp', {
            getFoldersByName: name => {
                if (opts.driveThrows) throw new Error('Drive exploded: internal stack at Code.gs:42');
                folderQueries.push(name);
                const present = opts.folders || ['multinotes_data'];
                return iterator(present.indexOf(name) >= 0 ? [fakeFolder(name, store, opts.synthetic)] : []);
            },
            getFolderById: () => { throw new Error('not found'); },
            getFileById: id => { if (!store.files[id]) throw new Error('no file'); return store.files[id]; }
        }),
        Session: readOnly('Session', {
            getEffectiveUser: () => readOnly('User', {
                getEmail: () => {
                    if (opts.sessionThrows) throw new Error('Session exploded');
                    return opts.sessionEmail === undefined ? 'owner@example.com' : opts.sessionEmail;
                }
            })
        }),
        ScriptApp: readOnly('ScriptApp', {
            getOAuthToken: () => {
                if (opts.noOAuth) throw new Error('Authorization is required to perform that action.');
                return OAUTH_TOKEN;
            }
        }),
        UrlFetchApp: fakeUrlFetchApp(store, opts),
        PropertiesService: {
            getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null) })
        },
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput: text => {
                const out = { text, mime: null };
                out.setMimeType = m => { out.mime = m; return out; };
                out.getContent = () => out.text;
                return out;
            }
        },
        Utilities: {
            formatDate: (date, tz, fmt) => {
                const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
                    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset'
                }).formatToParts(date).map(x => [x.type, x.value]));
                const day = `${p.year}-${p.month}-${p.day}`;
                if (fmt === 'yyyy-MM-dd') return day;
                const off = (p.timeZoneName || 'GMT+00:00').replace('GMT', '') || '+00:00';
                return `${day}T${p.hour}:${p.minute}:${p.second}${off}`;
            }
        },
        console: { log: logFn, info: logFn, warn: logFn, error: logFn },
        Logger: { log: logFn }
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(GS_PATH, 'utf8'), ctx, { filename: 'notes-api.gs' });
    if (opts.budgetMs !== undefined) vm.runInContext('SCAN_TIME_BUDGET_MS_ = ' + Number(opts.budgetMs), ctx);
    if (opts.batchCostMs !== undefined) {
        // Фалшив часовник: стои на място, всяка партида media изтегляния го мести с batchCostMs
        store.clock = { t: 1767225600000 };
        ctx.__clock = store.clock;
        vm.runInContext('Date.now = function () { return __clock.t; };', ctx);
    }
    ctx.__logs = logs;
    ctx.__store = store;
    ctx.__folderQueries = folderQueries;
    return ctx;
}

/** Пуска doGet и връща { status, body, raw, mime }. */
function call(params, opts = {}) {
    const ctx = makeContext(opts);
    const e = { parameter: params || {}, headers: opts.headers };
    const out = ctx.doGet(e);
    // Броячите са само за първото извикване (doGet), преди handleRequest_ по-долу
    const st = ctx.__store;
    const io = { blobReads: st.blobReads, mediaReads: st.mediaReads, fetchAllCalls: st.fetchAllCalls.slice(), indexCalls: st.indexCalls.slice(), aboutCalls: st.aboutCalls.slice() };
    let status; // HTTP статусът, който логиката е избрала (doGet го превръща в 500 при грешка)
    try { status = ctx.handleRequest_(e).status; } catch (err) { status = 500; }
    return { status, body: JSON.parse(out.getContent()), raw: out.getContent(), mime: out.mime, logs: ctx.__logs, folderQueries: ctx.__folderQueries, io, ctx };
}

// ---------------------------------------------------------------------------
// Тестове
// ---------------------------------------------------------------------------

const results = [];
function test(name, fn) {
    try {
        fn();
        results.push(true);
        console.log(`PASS  ${name}`);
    } catch (err) {
        results.push(false);
        console.log(`FAIL  ${name}\n      ${err && err.message}`);
    }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const RESULT_KEYS = ['id', 'gdid', 'title', 'board', 'boardId', 'date', 'modified', 'matchIn', 'snippet', 'text', 'driveUrl'];
const allRaw = [];
function search(params, opts) {
    const r = call(Object.assign({ key: TOKEN }, params), opts);
    allRaw.push(r.raw);
    return r;
}

test('1. без key и с грешен key -> 401, без ехо на ключа', () => {
    const none = call({ q: 'договор' });
    eq(none.status, 401, 'status без key');
    eq(none.raw, '{"ok":false,"error":"unauthorized"}', 'тяло без key');
    const wrongKey = 'guess-' + TOKEN.slice(0, 10) + '-attempt';
    const wrong = call({ q: 'договор', key: wrongKey });
    eq(wrong.status, 401, 'status с грешен key');
    eq(wrong.raw, '{"ok":false,"error":"unauthorized"}', 'тяло с грешен key');
    assert(!wrong.raw.includes(wrongKey) && !wrong.raw.includes(TOKEN), '401 съдържа ключ');
    assert(!wrong.logs.join('\n').includes(wrongKey), 'ключът е логнат');
    // Префикс на правилния ключ също не минава
    eq(call({ q: 'x', key: TOKEN.slice(0, -1) }).status, 401, 'префикс на ключа');
    // Без зададен API_TOKEN всичко е забранено, дори с "правилен" ключ
    eq(call({ key: TOKEN }, { noToken: true }).status, 401, 'без API_TOKEN');
    // X-API-Key хедър се приема (без значение от регистъра)
    eq(call({}, { headers: { 'x-api-key': TOKEN } }).status, 200, 'X-API-Key хедър');
});

test('2. без q -> health/метаданни', () => {
    const r = search({});
    eq(r.status, 200, 'status');
    eq(r.mime, 'application/json', 'mime');
    const b = r.body;
    eq(b.ok, true, 'ok');
    eq(b.folder, 'multinotes_data', 'folder');
    eq(b.count, 0, 'count');
    eq(b.truncated, false, 'truncated');
    assert(Array.isArray(b.results) && b.results.length === 0, 'results не е празен масив');
    assert(!('query' in b), 'health не трябва да има query');
    eq(b.scanned.noteFiles, 10, 'noteFiles');
    eq(b.scanned.notes, 10, 'notes (8 единични + 2 от масив, без повредения)');
    eq(b.scanned.boards, 3, 'boards');
    eq(search({ q: '   ' }).body.count, 0, 'празен q');
});

test('3. кирилска дума намира правилната бележка, snippet съдържа думата', () => {
    const r = search({ q: 'договора' });
    eq(r.body.ok, true, 'ok');
    eq(r.body.query, 'договора', 'query');
    eq(r.body.count, 1, 'count (бележката в Кошчето не се брои)');
    const n = r.body.results[0];
    eq(n.gdid, '1NoteMeetingBG', 'gdid = ID на note.txt (не старото вътрешно gdid)');
    eq(n.id, 101, 'id');
    eq(n.title, 'Среща с клиента', 'title');
    eq(n.matchIn, 'text', 'matchIn');
    eq(n.driveUrl, 'https://drive.google.com/file/d/1NoteMeetingBG/view', 'driveUrl');
    eq(n.date, '2026-03-10', 'date');
    eq(n.modified, '2026-03-12T12:00:00+02:00', 'modified');
    assert(n.snippet.includes('ДОГОВОРА'), 'snippet няма точното съвпадение: ' + n.snippet);
    assert(n.text.includes(n.snippet.replace(/^…|…$/g, '')), 'snippet не е подниз на text');
    const core = n.snippet.replace(/^…|…$/g, '');
    assert(core.length >= 190 && core.length <= 200, 'дължина на snippet ' + core.length);
    const at = core.indexOf('ДОГОВОРА');
    assert(at > 60 && at < 130, 'съвпадението не е центрирано: ' + at);
    eq(JSON.stringify(Object.keys(n)), JSON.stringify(RESULT_KEYS), 'полета на резултата');
    // Главни/малки букви: заявката с главни намира същото
    eq(search({ q: 'ДоГоВоРа' }).body.count, 1, 'регистър на заявката');
    // Сортиране: съвпадение в заглавието преди съвпадение само в текста
    const both = search({ q: 'договор' }).body.results;
    eq(both.map(x => x.gdid).join(','), '1NoteLeaseBG,1NoteMeetingBG', 'ред на сортиране');
    eq(both[0].title, 'Договор за наем', 'заглавие преди |');
    eq(both[0].matchIn, 'title', 'matchIn title');
});

test('4. няколко думи -> всички трябва да съвпаднат', () => {
    const alpha = search({ q: 'алфа' }).body;
    eq(alpha.count, 2, 'само "алфа"');
    const r = search({ q: 'алфа бюджет' }).body;
    eq(r.count, 1, 'алфа + бюджет');
    eq(r.results[0].gdid, '1NoteProjectAlpha', 'правилната бележка');
    eq(r.results[0].matchIn, 'both', 'matchIn both');
    eq(search({ q: 'алфа несъществуващадума' }).body.count, 0, 'липсваща дума');
    eq(search({ q: 'milk кафе' }).body.results[0].gdid, '1NoteGroceryEN', 'смесен език');
});

test('5. board филтър (по заглавие и по id), board е заглавието', () => {
    const r = search({ q: 'бюджет', board: 'Работа' }).body;
    eq(r.count, 2, 'бюджет в Работа');
    r.results.forEach(x => { eq(x.board, 'Работа', 'board title'); eq(x.boardId, 'bRabota', 'boardId'); });
    eq(search({ q: 'бюджет', board: 'работа' }).body.count, 2, 'заглавие без значение от регистъра');
    eq(search({ q: 'бюджет', board: 'bRabota' }).body.count, 2, 'board по gdid');
    const lich = search({ q: 'бюджет', board: 'Лични' }).body;
    eq(lich.count, 1, 'бюджет в Лични');
    eq(lich.results[0].board, 'Лични', 'Лични title');
    // Бележка с числов boardid (2) се свързва с борда по id
    const g = search({ q: 'coffee' }).body.results[0];
    eq(g.board, 'Лични', 'board по числов id');
    eq(g.boardId, 2, 'boardId суров');
    eq(search({ q: 'coffee', board: 'Лични' }).body.count, 1, 'филтър хваща числов boardid');
    eq(search({ q: 'бюджет', board: 'Няма такъв' }).body.count, 0, 'непознат борд');
    // Бележки от файл с масив
    const idei = search({ q: 'идея', board: 'Идеи' }).body;
    eq(idei.count, 2, 'две бележки от файла с масив');
    idei.results.forEach(x => eq(x.gdid, '1NoteArrayFile', 'gdid на бележка от масив'));
});

test('6. limit се спазва и truncated е коректно', () => {
    const r2 = search({ q: 'бюджет', limit: '2' }).body;
    eq(r2.count, 2, 'count при limit=2');
    eq(r2.results.length, 2, 'results при limit=2');
    eq(r2.truncated, true, 'truncated при limit=2');
    const r3 = search({ q: 'бюджет', limit: '3' }).body;
    eq(r3.count, 3, 'count при limit=3');
    eq(r3.truncated, false, 'truncated при точно 3');
    eq(search({ q: 'бюджет' }).body.truncated, false, 'по подразбиране');
    eq(search({ q: 'бюджет', limit: '100000' }).body.count, 3, 'limit над максимума');
    eq(search({ q: 'бюджет', limit: 'abc' }).body.count, 3, 'невалиден limit -> 20');
    // Сортиране по дата на промяна (без съвпадения в заглавието): най-новите отгоре
    const order = r3.results.map(x => x.gdid).join(',');
    eq(order, '1NoteProjectAlpha,1NoteBudgetEN,1NoteLeaseBG', 'ред по datemod');
});

test('7. повреденият файл не чупи отговора', () => {
    const r = search({ q: 'догово' });
    eq(r.status, 200, 'status');
    eq(r.body.ok, true, 'ok');
    eq(r.body.scanned.corrupt, 1, 'corrupt');
    assert(r.body.results.every(x => x.gdid !== '1NoteCorrupt'), 'повреденият файл е в резултатите');
});

test('8. в изхода няма pass/password/token полета, скритото съдържание не излиза', () => {
    // Скрита бележка: видимото превю се търси, скритата част — не
    const bank = search({ q: 'банка' }).body;
    eq(bank.count, 1, 'видимото превю се намира');
    eq(bank.results[0].text, 'Банка ДСК', 'text е само превюто');
    eq(search({ q: 'hunter2' }).body.count, 0, 'скритата част не се търси');
    eq(search({ q: 'password' }).body.count, 0, 'скритата част не се търси (password)');
    search({ q: 'а', limit: '100' });
    const bad = /"(pass|password|passwd|pwd|token|api_?key|secret|key)"\s*:/i;
    for (const raw of allRaw) {
        assert(!bad.test(raw), 'полето присъства: ' + raw.match(bad));
        assert(!raw.includes(TOKEN), 'ключът е в изхода');
        const body = JSON.parse(raw);
        // `query` е ехо на заявката — скритото съдържание не бива да е в резултатите
        const res = JSON.stringify(body.results || []);
        const leak = ['hunter2', 'sk-secret', '4321'].find(x => res.includes(x));
        assert(!leak, 'скрито съдържание в резултатите: ' + leak);
        (body.results || []).forEach(x => eq(JSON.stringify(Object.keys(x)), JSON.stringify(RESULT_KEYS), 'полета'));
    }
});

test('9. дати from/to', () => {
    eq(search({ q: 'бюджет', from: '2026-05-01' }).body.count, 2, 'from');
    eq(search({ q: 'бюджет', to: '2026-01-31' }).body.count, 1, 'to');
    eq(search({ q: 'бюджет', from: '2026-05-03', to: '2026-05-03' }).body.count, 1, 'един ден');
    const bad = search({ q: 'бюджет', from: '2026-13-01' });
    eq(bad.body.ok, false, 'невалидна дата');
    eq(bad.status, 400, 'status при невалидна дата');
});

test('10. неочаквана грешка -> 500 без stack trace; нищо не се записва в Drive', () => {
    const r = call({ key: TOKEN, q: 'x' }, { driveThrows: true });
    eq(r.status, 500, 'status');
    eq(r.raw, '{"ok":false,"error":"internal_error"}', 'тяло');
    eq(writeAttempts.length, 0, 'опити за запис/непознати методи: ' + writeAttempts.join(', '));
    const src = fs.readFileSync(GS_PATH, 'utf8');
    assert(!/\.(setContent|setTrashed|setName|moveTo|addFile|removeFile|createFile|createFolder|makeCopy|setProperty|deleteProperty)\s*\(/.test(src),
        'notes-api.gs съдържа метод за запис');
    // Единственото външно извикване е fetchAll с GET към media URL-а
    assert(!/UrlFetchApp\.fetch\s*\(/.test(src), 'notes-api.gs ползва UrlFetchApp.fetch');
    assert(!/(payload|['"](post|put|patch|delete)['"])/i.test(src), 'notes-api.gs съдържа payload или метод за запис по HTTP');
    assert(!/(upload\/drive|\/trash|\/copy|\/permissions)/.test(src), 'notes-api.gs сочи към endpoint за запис');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'appsscript.json'), 'utf8'));
    eq(manifest.webapp.access, 'ANYONE_ANONYMOUS', 'access');
    eq(manifest.webapp.executeAs, 'USER_DEPLOYING', 'executeAs');
    eq(manifest.timeZone, 'Europe/Sofia', 'timeZone');
    eq(JSON.stringify(manifest.oauthScopes), JSON.stringify([
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/script.external_request'
    ]), 'oauthScopes (само drive.readonly + external_request)');
});

test('11. CX-Notes е основната папка, multinotes_data остава fallback', () => {
    // Когато съществуват и двете: печели CX-Notes (както прави приложението)
    const both = call({ key: TOKEN, q: 'сигнал' }, { folders: ['CX-Notes', 'multinotes_data'] });
    eq(both.body.folder, 'CX-Notes', 'избрана папка');
    eq(both.folderQueries[0], 'CX-Notes', 'първо се търси CX-Notes');
    eq(both.body.count, 1, 'резултат само от CX-Notes');
    eq(both.body.results[0].gdid, '1NoteCXOnly', 'gdid');
    // Когато CX-Notes липсва: пада на legacy multinotes_data
    const legacy = call({ key: TOKEN, q: 'договора' }, { folders: ['multinotes_data'] });
    eq(legacy.body.folder, 'multinotes_data', 'fallback папка');
    eq(legacy.folderQueries.slice(0, 2).join(','), 'CX-Notes,multinotes_data', 'ред на търсене');
    eq(legacy.body.count, 1, 'fallback резултат');
});

const QUERIES = [{}, { q: 'договор' }, { q: 'бюджет', limit: '2' }, { q: 'идея', board: 'Идеи' }, { q: 'coffee' }, { q: 'а', limit: '100' }];

test('12. пакетното четене (fetchAll) дава идентичен резултат, без DriveApp четене', () => {
    for (const params of QUERIES) {
        const batch = search(params);
        const seq = search(params, { noOAuth: true });
        eq(batch.raw, seq.raw, 'batch срещу последователно за ' + JSON.stringify(params));
        eq(batch.io.blobReads, 0, 'DriveApp четения в пакетния път');
        eq(JSON.stringify(batch.io.fetchAllCalls), '[1,10]', 'fetchAll партиди (1 board.txt + 10 note.txt)');
        eq(batch.io.mediaReads, 11, 'успешни media изтегляния');
    }
    eq(writeAttempts.length, 0, 'опити за запис: ' + writeAttempts.join(', '));
    // 93 note.txt -> партиди по най-много 40
    const big = search({ q: 'синтетична', limit: '100' }, { synthetic: 83 });
    eq(big.body.scanned.noteFiles, 93, 'noteFiles');
    eq(big.body.count, 83, 'синтетичните бележки се намират');
    eq(big.body.scanned.capped, false, 'capped');
    eq(JSON.stringify(big.io.fetchAllCalls), '[1,40,40,13]', 'партиди за 93 файла');
    eq(big.io.blobReads, 0, 'DriveApp четения');
    assert(big.body.results.some(x => x.gdid === 'synthetic/000' && x.driveUrl.endsWith('/synthetic%2F000/view')), 'ID със `/`');
});

test('13. без OAuth токен -> последователно четене през DriveApp, същият отговор', () => {
    const r = search({ q: 'договора' }, { noOAuth: true });
    eq(r.body.ok, true, 'ok');
    eq(r.body.count, 1, 'count');
    eq(r.body.results[0].gdid, '1NoteMeetingBG', 'gdid');
    eq(r.body.scanned.noteFiles, 10, 'noteFiles');
    eq(r.body.scanned.corrupt, 1, 'corrupt');
    eq(r.io.fetchAllCalls.length, 0, 'fetchAll не се вика');
    eq(r.io.blobReads, 11, 'DriveApp четения');
    // И когато самият fetchAll хвърли: всеки файл пада на DriveApp
    const t = search({ q: 'договора' }, { fetchAllThrows: true });
    eq(t.raw, r.raw, 'fetchAll хвърля -> същият отговор');
    eq(t.io.blobReads, 11, 'DriveApp четения при хвърлящ fetchAll');
});

test('14. отговор ≠ 200 -> само този файл се чете през DriveApp', () => {
    const r = search({ q: 'договора' }, { failIds: ['1NoteMeetingBG'] });
    eq(r.body.count, 1, 'бележката пак се намира');
    eq(r.body.results[0].gdid, '1NoteMeetingBG', 'gdid');
    eq(r.body.scanned.corrupt, 1, 'corrupt не се променя');
    eq(r.io.blobReads, 1, 'само един DriveApp fallback');
    eq(r.io.mediaReads, 10, 'останалите през fetchAll');
    eq(r.raw, search({ q: 'договора' }).raw, 'същият отговор като без грешка');
});

test('15. изчерпан бюджет по време -> capped: true, ok: true вместо прекъсване', () => {
    const r = search({ q: 'договор' }, { budgetMs: -1 });
    eq(r.body.ok, true, 'ok');
    eq(r.body.scanned.capped, true, 'capped');
    eq(r.body.truncated, true, 'truncated');
    eq(r.body.scanned.noteFiles, 0, 'нито една партида не е прочетена');
    eq(r.body.scanned.boards, 3, 'бордовете не са засегнати');
    eq(JSON.stringify(r.io.fetchAllCalls), '[1]', 'само партидата с бордове');
    eq(writeAttempts.length, 0, 'опити за запис: ' + writeAttempts.join(', '));
    // Самият фалшив fetchAll наистина отказва всичко освен GET media изтегляне
    const guard = fakeUrlFetchApp({ contents: {}, fetchAllCalls: [] }, {});
    const refused = [
        { url: 'https://www.googleapis.com/drive/v3/files/1NoteLeaseBG?alt=media&supportsAllDrives=true', method: 'delete' },
        { url: 'https://www.googleapis.com/drive/v3/files/1NoteLeaseBG?alt=media&supportsAllDrives=true', method: 'get', payload: '{}' },
        { url: 'https://www.googleapis.com/drive/v3/files/1NoteLeaseBG', method: 'patch' },
        { url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=media', method: 'post' }
    ].filter(req => { try { guard.fetchAll([req]); return false; } catch (err) { return true; } });
    eq(refused.length, 4, 'отказани заявки за запис');
    assert((() => { try { guard.fetch('x'); return false; } catch (err) { return true; } })(), 'fetch() не е разрешен');
    eq(writeAttempts.splice(0).length, 5, 'отказаните заявки са записани');
});

test('16. budget и batch: валидирани и ограничени, по подразбиране константите', () => {
    const ctx = makeContext();
    eq(ctx.parseBudget_(undefined), 18000, 'budget по подразбиране');
    eq(ctx.parseBudget_('abc'), 18000, 'невалиден budget');
    eq(ctx.parseBudget_('1'), 3000, 'budget под минимума');
    eq(ctx.parseBudget_('-5'), 3000, 'отрицателен budget');
    eq(ctx.parseBudget_('99999'), 25000, 'budget над максимума');
    eq(ctx.parseBudget_('12000'), 12000, 'budget в границите');
    eq(ctx.parseBatch_(undefined), 40, 'batch по подразбиране');
    eq(ctx.parseBatch_('x'), 40, 'невалиден batch');
    eq(ctx.parseBatch_('1'), 5, 'batch под минимума');
    eq(ctx.parseBatch_('1000'), 100, 'batch над максимума');
    // batch наистина управлява партидите: 93 note.txt
    const opts = { synthetic: 83 };
    eq(JSON.stringify(search({ q: 'синтетична', batch: '1' }, opts).io.fetchAllCalls), JSON.stringify([1].concat(Array(18).fill(5), [3])), 'batch=1 -> 5');
    eq(JSON.stringify(search({ q: 'синтетична', batch: '1000' }, opts).io.fetchAllCalls), '[1,93]', 'batch=1000 -> 100');
    eq(JSON.stringify(search({ q: 'синтетична', batch: '30' }, opts).io.fetchAllCalls), '[1,30,30,30,3]', 'batch=30');
    // Нови полета до старите
    const b = search({ q: 'договор' }).body;
    eq(b.totalFiles, 10, 'totalFiles');
    eq(b.partial, false, 'partial');
    eq(b.mode, 'scan', 'mode (индексът на фалшивия Drive е изключен -> scan)');
});

test('17. бюджетът се пази и за следващата партида (по средното време)', () => {
    // Всяка партида "трае" 1000 ms; budget=1 -> 3000. Бордове 0→1000, бележки 1000→2000→3000;
    // третата партида (3000 + 1000 > 3000) не се пуска, иначе би стигнала 4000.
    const r = search({ q: 'синтетична', budget: '1', batch: '5', debug: '1', limit: '100' }, { synthetic: 83, batchCostMs: 1000 });
    eq(JSON.stringify(r.io.fetchAllCalls), '[1,5,5]', 'партиди');
    eq(r.body.ok, true, 'ok');
    eq(r.body.partial, true, 'partial');
    eq(r.body.truncated, true, 'truncated');
    eq(r.body.scanned.capped, true, 'capped');
    eq(r.body.scanned.noteFiles, 10, 'прочетени файлове');
    eq(r.body.totalFiles, 93, 'totalFiles');
    eq(JSON.stringify(r.body.timing.batches), '[1000,1000]', 'времена на партидите');
    assert(r.body.timing.totalMs <= 3000, 'бюджетът е надхвърлен: ' + r.body.timing.totalMs);
    // С достатъчен бюджет всичко се прочита
    const full = search({ q: 'синтетична', budget: '25000', batch: '5', limit: '100' }, { synthetic: 83, batchCostMs: 1000 });
    eq(full.body.partial, false, 'partial при budget=25000');
    eq(full.body.count, 83, 'всички синтетични');
});

test('18. debug=1 добавя timing, без debug — нищо допълнително', () => {
    const plain = search({ q: 'договор' });
    assert(!('timing' in plain.body), 'timing без debug');
    assert(!('timing' in search({ q: 'договор', debug: 'true' }).body), 'timing при debug≠1');
    const r = search({ q: 'договор', debug: '1' });
    const t = r.body.timing;
    eq(JSON.stringify(Object.keys(t)), JSON.stringify(['folderMs', 'filesListMs', 'filesTotal', 'batches', 'bytesRead', 'boardsMs', 'totalMs']), 'полета на timing');
    ['folderMs', 'filesListMs', 'boardsMs', 'totalMs'].forEach(k => assert(typeof t[k] === 'number' && t[k] >= 0, k + ' не е число'));
    eq(t.filesTotal, 10, 'filesTotal');
    eq(t.batches.length, 1, 'една партида от 10 файла');
    const dir = path.join(FIXTURES, 'multinotes_data');
    const bytes = fs.readdirSync(dir).filter(id => fs.existsSync(path.join(dir, id, 'note.txt')))
        .reduce((n, id) => n + Buffer.byteLength(fs.readFileSync(path.join(dir, id, 'note.txt'), 'utf8')), 0);
    eq(t.bytesRead, bytes, 'bytesRead');
    // Останалото тяло е същото като без debug
    const same = Object.assign({}, r.body); delete same.timing;
    eq(JSON.stringify(same), plain.raw, 'debug не променя останалото');
    // Health check също
    assert('timing' in search({ debug: '1' }).body, 'timing в health');
});

test('19. index: Drive заявка с fullText на всяка дума, екраниране, същите резултати', () => {
    const ctx = makeContext();
    eq(ctx.buildIndexQuery_("fo'l\\d", ['x']),
        "'fo\\'l\\\\d' in parents and name = 'note.txt' and trashed = false and fullText contains 'x'", 'екраниране на папката');
    const r = search({ q: "It's a\\b", mode: 'index' }, { index: true });
    eq(r.io.indexCalls.length, 1, 'едно търсене в индекса');
    const call0 = r.io.indexCalls[0];
    eq(call0.q, "'folder-multinotes_data' in parents and name = 'note.txt' and trashed = false and fullText contains 'it\\'s' and fullText contains 'a\\\\b'", 'q с екраниране и AND');
    eq(call0.fields, 'nextPageToken,files(id,name)', 'fields');
    eq(call0.pageSize, '1000', 'pageSize');
    eq(call0.auth, 'Bearer ' + OAUTH_TOKEN, 'Bearer токенът на пакетното четене');
    eq(r.body.mode, 'index', 'mode');
    eq(r.body.count, 0, 'няма такива бележки');
    // Няколко думи: четат се само кандидатите, резултатите са като при scan
    const multi = search({ q: 'алфа бюджет', mode: 'index' }, { index: true });
    assert(/fullText contains 'алфа' and fullText contains 'бюджет'$/.test(multi.io.indexCalls[0].q), 'две клаузи: ' + multi.io.indexCalls[0].q);
    eq(multi.body.mode, 'index', 'mode index');
    eq(JSON.stringify(multi.io.fetchAllCalls), '[1,1]', 'прочетен е само кандидатът');
    eq(multi.body.totalFiles, 1, 'totalFiles = кандидатите');
    eq(multi.body.results[0].gdid, '1NoteProjectAlpha', 'gdid');
    for (const q of ['договор', 'бюджет', 'coffee', 'идея', 'алфа бюджет', 'milk кафе']) {
        const idx = search({ q, mode: 'auto' }, { index: true }).body;
        const scan = search({ q, mode: 'scan' }, { index: true });
        eq(idx.mode, 'index', 'auto ползва индекса за ' + q);
        eq(scan.io.indexCalls.length, 0, 'mode=scan не пита индекса');
        eq(JSON.stringify(idx.results), JSON.stringify(scan.body.results), 'index срещу scan за ' + q);
    }
    // Индексът вижда и скритата част / Кошчето — скриптът проверява наново
    const hidden = search({ q: 'hunter2' }, { index: true }).body;
    eq(hidden.mode, 'index', 'кандидат от индекса');
    eq(hidden.count, 0, 'скритата част пак не се намира');
    // Кандидатите се четат през batch
    const big = search({ q: 'синтетична', mode: 'index', batch: '5', limit: '100' }, { index: true, synthetic: 12 });
    eq(JSON.stringify(big.io.fetchAllCalls), '[1,5,5,2]', 'партиди на кандидатите');
    eq(big.body.count, 12, 'всички кандидати');
    // При грешка в media изтеглянето кандидатът се отваря през DriveApp.getFileById
    const fb = search({ q: 'договора', mode: 'index' }, { index: true, failIds: ['1NoteMeetingBG'] });
    eq(fb.body.results[0].gdid, '1NoteMeetingBG', 'fallback по ID');
    eq(fb.io.blobReads, 1, 'един DriveApp fallback');
    eq(writeAttempts.length, 0, 'опити за запис: ' + writeAttempts.join(', '));
});

test('20. auto: нула кандидати или грешка в индекса -> пълно сканиране', () => {
    const scan = search({ q: 'договор', mode: 'scan' });
    const empty = search({ q: 'договор' }, { index: 'empty' });
    eq(empty.io.indexCalls.length, 1, 'индексът е питан');
    eq(empty.body.mode, 'scan', 'fallback към scan');
    eq(JSON.stringify(empty.io.fetchAllCalls), '[1,10]', 'пълно сканиране');
    eq(empty.raw, scan.raw, 'отговорът е като при mode=scan');
    const down = search({ q: 'договор' }); // фалшивият индекс връща 403
    eq(down.io.indexCalls.length, 1, 'индексът е питан (403)');
    eq(down.raw, scan.raw, '403 -> scan');
    eq(search({ q: 'договор' }, { noOAuth: true }).io.indexCalls.length, 0, 'без токен индексът не се пита');
    // mode=index: без fallback
    const only = search({ q: 'договор', mode: 'index' }, { index: 'empty' });
    eq(only.body.mode, 'index', 'mode index');
    eq(only.body.count, 0, 'count');
    eq(only.body.totalFiles, 0, 'totalFiles');
    eq(only.body.partial, false, 'partial');
    eq(JSON.stringify(only.io.fetchAllCalls), '[1]', 'само бордовете');
    const fail = search({ q: 'договор', mode: 'index' });
    eq(fail.status, 503, 'status при недостъпен индекс');
    eq(fail.raw, '{"ok":false,"error":"index_unavailable"}', 'тяло при недостъпен индекс');
    // Непознат mode -> auto; health check винаги е scan
    eq(search({ q: 'договор', mode: 'xyz' }, { index: true }).body.mode, 'index', 'непознат mode');
    eq(search({ mode: 'index' }, { index: true }).body.mode, 'scan', 'health');
});

test('21. account и driveAccount във всеки успешен отговор, null при грешка', () => {
    const r = search({ q: 'договор' }, { driveAccount: 'drive@example.com' });
    eq(r.body.account, 'owner@example.com', 'account');
    eq(r.body.driveAccount, 'drive@example.com', 'driveAccount');
    eq(JSON.stringify(r.io.aboutCalls), '[2]', 'about пътува в един fetchAll с бордовете');
    eq(JSON.stringify(r.io.fetchAllCalls), '[1,10]', 'без допълнителни партиди');
    for (const params of [{}, { q: 'договор', mode: 'scan' }, { q: 'договор', mode: 'index' }, { q: 'договор', mode: 'auto' }, { q: 'договор', debug: '1' }]) {
        const b = search(params, { index: true, driveAccount: 'drive@example.com' }).body;
        eq(b.account, 'owner@example.com', 'account за ' + JSON.stringify(params));
        eq(b.driveAccount, 'drive@example.com', 'driveAccount за ' + JSON.stringify(params));
    }
    const nulls = [
        [{ sessionThrows: true, driveAccount: 'drive@example.com' }, null, 'drive@example.com', 'Session хвърля'],
        [{ sessionEmail: '' }, null, null, 'празен Session имейл / about 403'],
        [{ driveAccount: '' }, 'owner@example.com', null, 'празен about имейл'],
        [{ driveAccount: 'drive@example.com', aboutThrows: true }, 'owner@example.com', null, 'about отговорът хвърля'],
        [{ driveAccount: 'drive@example.com', fetchAllThrows: true }, 'owner@example.com', null, 'fetchAll хвърля'],
        [{ driveAccount: 'drive@example.com', noOAuth: true }, 'owner@example.com', null, 'без токен']
    ];
    for (const [opts, account, drive, label] of nulls) {
        const x = search({ q: 'договора' }, opts);
        eq(x.body.ok, true, 'ok: ' + label);
        eq(x.body.count, 1, 'count: ' + label);
        eq(x.body.account, account, 'account: ' + label);
        eq(x.body.driveAccount, drive, 'driveAccount: ' + label);
    }
    eq(search({ q: 'x' }, { driveAccount: 'drive@example.com', noOAuth: true }).io.aboutCalls.length, 0, 'без токен about не се вика');
    assert(!('account' in call({ q: 'x' }).body), 'account в 401');
});

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
