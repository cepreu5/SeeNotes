/**
 * SeeNotes — HTTP endpoint за търсене в бележките (само четене).
 *
 * Google Apps Script Web App. Работи от името на собственика на папката
 * `CX-Notes` (fallback `multinotes_data`) и чете директно файловете `note.txt`
 * (по една бележка на файл) и `board.txt` (бордовете) през DriveApp.
 *
 * СТРОГО READ-ONLY: скриптът никога не създава, променя, трие или мести
 * нищо в Drive. Използват се само getFoldersByName / getFolderById /
 * getFileById / getFilesByName / getBlob / getId / isTrashed, плюс два вида
 * външни извиквания, и двете GET през UrlFetchApp.fetchAll: изтегляне на
 * съдържанието на файл (Drive API v3 `files/<id>?alt=media`) и пълнотекстово
 * търсене в списъка с файлове (Drive API v3 `files?q=... fullText contains`).
 *
 * Схемата на бележката е взета от uni/main.js (newNote / parseFileResults):
 *   id, gdid, boardid, notetxt, date, datemod, status, pass, type, ...
 *   - бележката НЯМА поле `title` — заглавието се извежда от `notetxt`
 *     (текстът преди `|`, иначе първият непразен ред), както прави UI-то;
 *   - `pass: true` = скрита бележка: видима е само частта преди `|`;
 *   - `status: 1` = бележката е в Кошчето.
 * Бордът (board.txt): id, gdid, title, status, ... Бележката сочи борда
 * през `boardid`, който съвпада с `board.gdid` или `board.id`.
 *
 * Параметри: key, q, board, from, to, limit, mode, budget, batch, debug —
 * виж README.md.
 */

var FOLDER_NAMES_ = ['CX-Notes', 'multinotes_data']; // CX-Notes е основната папка (както в приложението), multinotes_data остава само fallback
var TIME_ZONE_ = 'Europe/Sofia';
var DEFAULT_LIMIT_ = 20;
var MAX_LIMIT_ = 100;
var MAX_NOTE_FILES_ = 2000;       // Таван на прочетените note.txt файлове за една заявка
var SCAN_TIME_BUDGET_MS_ = 18000; // Бюджет по време по подразбиране (`budget`): проксито пред Web App-а чака най-много 30 s
var MIN_BUDGET_MS_ = 3000;
var MAX_BUDGET_MS_ = 25000;
var FETCH_BATCH_SIZE_ = 40;       // Файлове в един UrlFetchApp.fetchAll по подразбиране (`batch`)
var MIN_BATCH_SIZE_ = 5;
var MAX_BATCH_SIZE_ = 100;
var INDEX_PAGE_SIZE_ = 1000;      // Кандидати от едно пълнотекстово търсене в Drive (една страница)
var DRIVE_FILES_URL_ = 'https://www.googleapis.com/drive/v3/files';
var DRIVE_MEDIA_URL_ = DRIVE_FILES_URL_ + '/';
var DRIVE_ABOUT_URL_ = 'https://www.googleapis.com/drive/v3/about?fields=user';
var SNIPPET_LEN_ = 200;

/**
 * Единствената входна точка. Всичко е в try/catch — навън никога не излиза
 * суров stack trace на Apps Script.
 */
function doGet(e) {
    var res;
    try {
        res = handleRequest_(e || {});
    } catch (err) {
        // Не логваме параметрите на заявката — там може да е ключът
        console.error('[notes-api] Unexpected error: ' + (err && err.message ? err.message : err));
        res = { status: 500, body: { ok: false, error: 'internal_error' } };
    }
    return ContentService.createTextOutput(JSON.stringify(res.body))
        .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Логиката без ContentService. Връща { status, body }.
 * ВНИМАНИЕ: Apps Script Web App не позволява да се зададе HTTP статус —
 * отговорът винаги е 200. `status` е вътрешен (ползва се от теста), а
 * клиентът трябва да проверява полето `ok` в JSON-а.
 */
function handleRequest_(e) {
    var params = e.parameter || {};

    if (!isAuthorized_(params, e.headers)) {
        return { status: 401, body: { ok: false, error: 'unauthorized' } };
    }

    var q = String(params.q || '').trim();
    var boardParam = String(params.board || '').trim();
    var from = String(params.from || '').trim();
    var to = String(params.to || '').trim();
    var limit = parseLimit_(params.limit);
    var mode = parseMode_(params.mode);
    var debug = String(params.debug || '') === '1';

    if ((from && !isIsoDate_(from)) || (to && !isIsoDate_(to))) {
        return { status: 400, body: { ok: false, error: 'bad_date' } };
    }

    // Бюджетът по време е общ за всичко: папката, бордовете, индекса и бележките
    var started = Date.now();
    var timing = { folderMs: 0, filesListMs: 0, filesTotal: 0, batches: [], bytesRead: 0, boardsMs: 0, totalMs: 0 };
    var run = {
        started: started,
        budget: parseBudget_(params.budget),
        batch: parseBatch_(params.batch),
        token: getOAuthTokenSafe_(), // Един токен за индекса и за пакетното четене
        timing: timing
    };

    var folder = findNotesFolder_();
    timing.folderMs = Date.now() - started;
    if (!folder) {
        return { status: 404, body: { ok: false, error: 'folder_not_found' } };
    }

    var t0 = Date.now();
    var boards = loadBoards_(folder, run);
    timing.boardsMs = Date.now() - t0;

    var words = q.toLowerCase().split(/\s+/).filter(function (w) { return w !== ''; });

    // Бърз път: пълнотекстовото търсене на Drive дава кандидатите, четат се
    // само те. Съвпадението и snippet-ът пак се решават от matchNote_ по-долу —
    // индексът само стеснява кои файлове се четат.
    var loaded = null;
    var usedMode = 'scan';
    if (words.length && mode !== 'scan') {
        t0 = Date.now();
        var index = queryIndex_(folder, words, run.token);
        timing.filesListMs += Date.now() - t0;
        if (index && index.ids.length) {
            var candidates = index.ids.map(function (id) { return { id: id, file: null }; });
            loaded = loadNotesFromRecords_(candidates, run);
            if (!index.complete) loaded.capped = true;
            usedMode = 'index';
        } else if (mode === 'index') {
            if (!index) return { status: 503, body: { ok: false, error: 'index_unavailable' } };
            loaded = { notes: [], noteFiles: 0, totalFiles: 0, corrupt: 0, capped: false };
            usedMode = 'index';
        }
        // auto: грешка, отговор ≠ 200 или нула кандидати -> пълно сканиране
    }
    if (!loaded) loaded = loadNotes_(folder, run);
    timing.filesTotal = loaded.totalFiles;

    var scanned = {
        noteFiles: loaded.noteFiles,
        notes: loaded.notes.length,
        boards: boards.length,
        corrupt: loaded.corrupt,
        capped: loaded.capped
    };
    var finish = function (body) {
        if (debug) {
            timing.totalMs = Date.now() - started;
            body.timing = timing;
        }
        return { status: 200, body: body };
    };

    // Без q — само метаданни (health check)
    if (!q) {
        return finish({
            ok: true, folder: folder.getName(), scanned: scanned, count: 0, truncated: false,
            totalFiles: loaded.totalFiles, partial: loaded.capped, mode: usedMode,
            account: effectiveUserEmail_(), driveAccount: run.driveAccount || null, results: []
        });
    }

    var boardIds = boardParam ? resolveBoardIds_(boards, boardParam) : null;
    var matches = [];

    loaded.notes.forEach(function (note) {
        if (note.status === 1) return; // Кошчето не участва в търсенето
        if (boardIds && !boardIds[String(note.boardid)]) return;
        if (from || to) {
            var day = formatDay_(noteTimestamp_(note));
            if (!day) return;
            if (from && day < from) return;
            if (to && day > to) return;
        }
        var m = matchNote_(note, words);
        if (m) matches.push(m);
    });

    // Първо съвпаденията в заглавието, после по дата на промяна (най-новите отгоре)
    matches.sort(function (a, b) {
        if (a.titleHit !== b.titleHit) return a.titleHit ? -1 : 1;
        return b.sortTime - a.sortTime;
    });

    var truncated = matches.length > limit || loaded.capped;
    var results = matches.slice(0, limit).map(function (m) {
        return buildResult_(m, boards);
    });

    return finish({
        ok: true,
        folder: folder.getName(),
        query: q,
        count: results.length,
        truncated: truncated,
        scanned: scanned,
        totalFiles: loaded.totalFiles,
        partial: loaded.capped,
        mode: usedMode,
        account: effectiveUserEmail_(),
        driveAccount: run.driveAccount || null,
        results: results
    });
}

// =================================================================================
// Достъп
// =================================================================================

/**
 * Ключът се пази в Script Property `API_TOKEN`. Приема се като параметър
 * `key` или като хедър `X-API-Key` (ако средата изобщо подава хедъри — виж
 * README). Без зададен API_TOKEN всичко е забранено (fail closed).
 * Стойността никога не се логва и не се връща в отговора.
 */
function isAuthorized_(params, headers) {
    var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected) return false;
    var provided = params.key;
    if (!provided && headers) {
        for (var h in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, h) && String(h).toLowerCase() === 'x-api-key') {
                provided = headers[h];
                break;
            }
        }
    }
    if (Array.isArray(provided)) provided = provided[0];
    if (!provided) return false;
    return safeEqual_(String(provided), String(expected));
}

/**
 * Сравнение без ранно излизане — времето не зависи от това докъде съвпадат.
 */
function safeEqual_(a, b) {
    var len = Math.max(a.length, b.length);
    var diff = a.length ^ b.length;
    for (var i = 0; i < len; i++) {
        var ca = i < a.length ? a.charCodeAt(i) : 0;
        var cb = i < b.length ? b.charCodeAt(i) : 0;
        diff |= ca ^ cb;
    }
    return diff === 0;
}

function parseLimit_(raw) {
    var n = parseInt(raw, 10);
    if (isNaN(n) || n < 1) return DEFAULT_LIMIT_;
    return Math.min(n, MAX_LIMIT_);
}

/** Цяло число в [min, max]; липсващо или невалидно -> стойността по подразбиране. */
function parseClamped_(raw, def, min, max) {
    var n = parseInt(raw, 10);
    if (isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
}

function parseBudget_(raw) {
    return parseClamped_(raw, SCAN_TIME_BUDGET_MS_, MIN_BUDGET_MS_, MAX_BUDGET_MS_);
}

function parseBatch_(raw) {
    return parseClamped_(raw, FETCH_BATCH_SIZE_, MIN_BATCH_SIZE_, MAX_BATCH_SIZE_);
}

/** `scan`, `index` или `auto` (по подразбиране, и при непозната стойност). */
function parseMode_(raw) {
    var m = String(raw || '').trim().toLowerCase();
    return m === 'scan' || m === 'index' ? m : 'auto';
}

function isIsoDate_(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().substring(0, 10) === s;
}

// =================================================================================
// Четене от Drive (само четене!)
// =================================================================================

/**
 * По избор Script Property `FOLDER_ID` фиксира точната папка; иначе търсим
 * по име: първо CX-Notes, после multinotes_data (както приложението).
 */
function findNotesFolder_() {
    var folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
    if (folderId) {
        try { return DriveApp.getFolderById(folderId); } catch (err) { return null; }
    }
    for (var i = 0; i < FOLDER_NAMES_.length; i++) {
        var it = DriveApp.getFoldersByName(FOLDER_NAMES_[i]);
        while (it.hasNext()) {
            var f = it.next();
            if (!f.isTrashed()) return f;
        }
    }
    return null;
}

/**
 * Парсва тялото на файл до масив от обекти: единичен обект или масив.
 * Връща null при повреден/непарсваем файл.
 */
function parseItems_(body) {
    if (!body || String(body).trim() === '') return [];
    var content;
    try { content = JSON.parse(body); } catch (err) { return null; }
    if (Array.isArray(content)) {
        return content.filter(function (x) { return x && typeof x === 'object' && !Array.isArray(x); });
    }
    if (content && typeof content === 'object') return [content];
    return null;
}

function readFileText_(file) {
    return file.getBlob().getDataAsString('UTF-8');
}

/**
 * Като readFileText_, но null вместо грешка (файлът се брои за повреден).
 * Кандидатите от индекса нямат DriveApp обект — отварят се по ID.
 */
function readFileTextSafe_(rec) {
    try { return readFileText_(rec.file || DriveApp.getFileById(rec.id)); } catch (err) { return null; }
}

function getOAuthTokenSafe_() {
    try { return ScriptApp.getOAuthToken() || null; } catch (err) { return null; }
}

/** Приблизителен брой байтове в UTF-8 (само за debug статистиката). */
function utf8Length_(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
        else n += 3;
    }
    return n;
}

function driveGet_(url, token) {
    return { url: url, method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
}

/**
 * Събира файловете с дадено име (без тези в Кошчето на Drive), най-много
 * `max` броя. Само обхожда списъка — съдържанието не се чете тук.
 */
function collectFiles_(folder, name, max) {
    var records = [];
    var capped = false;
    var it = folder.getFilesByName(name);
    while (it.hasNext()) {
        if (records.length >= max) { capped = true; break; }
        var file = it.next();
        if (file.isTrashed()) continue;
        records.push({ id: file.getId(), file: file });
    }
    return { records: records, capped: capped };
}

/**
 * Чете съдържанието на много файлове наведнъж: вместо по една HTTPS заявка
 * на файл през DriveApp, изтегля до `opts.batch` файла паралелно с
 * UrlFetchApp.fetchAll (Drive API v3, `alt=media` — само GET, само четене).
 *
 * Връща масив с текстовете в реда на `records` (null = нечетим файл).
 * Ако е подаден `opts.started`, преди всяка партида се проверява бюджетът
 * `opts.budget`: спираме, ако вече е изчерпан ИЛИ ако средното време на
 * досегашните партиди казва, че следващата би го надхвърлила (първата
 * партида няма мярка и се пуска, ако бюджетът не е изчерпан). При спиране
 * масивът е по-къс от `records`.
 *
 * `opts.extra` — допълнителни GET заявки, които пътуват в същия fetchAll
 * като първата партида (без отделно извикване); отговорите им са в
 * `opts.extraResponses` (null при грешка).
 * `opts.timing` — ако е подаден, в него се трупат времената на партидите и
 * прочетените байтове.
 *
 * Резервни пътища (резултатът е същият, само по-бавен):
 *   - отговор ≠ 200, грешка или липсващ отговор -> DriveApp за този файл;
 *   - няма OAuth токен -> DriveApp последователно за всички файлове.
 */
function readFilesTextBatch_(records, opts) {
    var texts = [];
    var timing = opts.timing || null;
    var times = [];
    var stopNow = function (perStep) {
        if (opts.started === undefined) return false;
        var elapsed = Date.now() - opts.started;
        if (elapsed > opts.budget) return true;
        if (!times.length) return false;
        var sum = 0;
        for (var t = 0; t < times.length; t++) sum += times[t];
        return elapsed + (sum / times.length) * perStep > opts.budget;
    };
    var keep = function (text) {
        if (timing && text) timing.bytesRead += utf8Length_(text);
        texts.push(text);
    };

    var token = opts.token;
    if (!token) {
        for (var s = 0; s < records.length; s++) {
            if (stopNow(1)) break;
            var t1 = Date.now();
            keep(readFileTextSafe_(records[s]));
            times.push(Date.now() - t1);
        }
        return texts;
    }

    var size = opts.batch || FETCH_BATCH_SIZE_;
    var extra = opts.extra || [];
    for (var start = 0; start < records.length; start += size) {
        if (stopNow(1)) break;
        var t0 = Date.now();
        var chunk = records.slice(start, start + size);
        var requests = chunk.map(function (r) {
            return driveGet_(DRIVE_MEDIA_URL_ + encodeURIComponent(r.id) + '?alt=media&supportsAllDrives=true', token);
        });
        if (start === 0 && extra.length) requests = requests.concat(extra);
        var responses = null;
        try { responses = UrlFetchApp.fetchAll(requests); } catch (err) { responses = null; }
        if (start === 0 && extra.length) {
            opts.extraResponses = responses ? responses.slice(chunk.length) : extra.map(function () { return null; });
            extra = [];
        }
        for (var i = 0; i < chunk.length; i++) {
            var resp = responses ? responses[i] : null;
            var text = null;
            var ok = false;
            if (resp) {
                try {
                    if (resp.getResponseCode() === 200) {
                        text = resp.getContentText('UTF-8');
                        ok = true;
                    }
                } catch (err) { ok = false; }
            }
            keep(ok ? text : readFileTextSafe_(chunk[i]));
        }
        var ms = Date.now() - t0;
        times.push(ms);
        if (timing) timing.batches.push(ms);
    }
    if (extra.length) { // Нямаше нито една партида — допълнителните заявки отиват сами
        try { opts.extraResponses = UrlFetchApp.fetchAll(extra); } catch (err) { opts.extraResponses = extra.map(function () { return null; }); }
    }
    return texts;
}

// =================================================================================
// Бърз път: пълнотекстово търсене в Drive (само четене)
// =================================================================================

/** Екранира `\` и `'` за низ в Drive заявка (`'...'`). */
function escapeDriveQuery_(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * q за Drive API v3 files.list: note.txt в папката, извън Кошчето на Drive,
 * по една клауза `fullText contains` на дума, свързани с `and`.
 */
function buildIndexQuery_(folderId, words) {
    var clauses = [
        "'" + escapeDriveQuery_(folderId) + "' in parents",
        "name = 'note.txt'",
        'trashed = false'
    ];
    words.forEach(function (w) {
        clauses.push("fullText contains '" + escapeDriveQuery_(w) + "'");
    });
    return clauses.join(' and ');
}

function buildIndexUrl_(folderId, words) {
    return DRIVE_FILES_URL_ + '?fields=' + encodeURIComponent('nextPageToken,files(id,name)') +
        '&pageSize=' + INDEX_PAGE_SIZE_ +
        '&q=' + encodeURIComponent(buildIndexQuery_(folderId, words));
}

/**
 * Пита индекса на Drive кои note.txt съдържат всички думи. Връща
 * { ids, complete } (complete: false = има още страници, които не четем)
 * или null при каквато и да е грешка / отговор ≠ 200 / липсващ токен.
 * Индексът само подбира кандидати — съвпадението се проверява наново.
 */
function queryIndex_(folder, words, token) {
    if (!token) return null;
    try {
        var resp = UrlFetchApp.fetchAll([driveGet_(buildIndexUrl_(folder.getId(), words), token)])[0];
        if (!resp || resp.getResponseCode() !== 200) return null;
        var data = JSON.parse(resp.getContentText('UTF-8'));
        if (!data || !Array.isArray(data.files)) return null;
        var seen = {};
        var ids = [];
        data.files.forEach(function (f) {
            if (!f || !f.id || f.name !== 'note.txt' || seen[f.id]) return;
            seen[f.id] = true;
            ids.push(String(f.id));
        });
        return { ids: ids, complete: !data.nextPageToken };
    } catch (err) {
        return null;
    }
}

// =================================================================================
// Акаунт, от чието име работи скриптът
// =================================================================================

/** Имейлът от Session; null при грешка или празна стойност. */
function effectiveUserEmail_() {
    try {
        var email = Session.getEffectiveUser().getEmail();
        return email ? String(email) : null;
    } catch (err) {
        return null;
    }
}

function aboutRequest_(token) {
    return driveGet_(DRIVE_ABOUT_URL_, token);
}

/** user.emailAddress от отговора на Drive about; null при грешка или празна стойност. */
function aboutEmail_(resp) {
    try {
        if (!resp || resp.getResponseCode() !== 200) return null;
        var data = JSON.parse(resp.getContentText('UTF-8'));
        var email = data && data.user && data.user.emailAddress;
        return email ? String(email) : null;
    } catch (err) {
        return null;
    }
}

/**
 * Зарежда бордовете от всички board.txt. Дедупликация по заглавие
 * (`board_<title>`), като в parseFileResults — първият печели.
 */
function loadBoards_(folder, run) {
    var byKey = {};
    var list = [];
    var records = collectFiles_(folder, 'board.txt', Infinity).records;
    // Drive about (driveAccount) пътува в същия fetchAll като бордовете
    var opts = { token: run.token, batch: run.batch, extra: run.token ? [aboutRequest_(run.token)] : [] };
    var texts = readFilesTextBatch_(records, opts);
    run.driveAccount = aboutEmail_(opts.extraResponses ? opts.extraResponses[0] : null);
    records.forEach(function (rec, n) {
        var items = texts[n] === null ? null : parseItems_(texts[n]);
        if (!items) return;
        items.forEach(function (b) {
            if (!b.gdid && items.length === 1) b.gdid = rec.id; // само в паметта, не се записва
            var key = b.title ? 'board_' + String(b.title).trim().toLowerCase() : String(b.gdid || b.id);
            if (byKey[key]) return;
            byKey[key] = true;
            list.push(b);
        });
    });
    return list;
}

/**
 * Зарежда бележките от всички note.txt. Както в parseFileResults, `gdid` се
 * презаписва с Drive ID на самия файл и дедупликацията е по `gdid`
 * (първият печели). Ако файлът съдържа масив, всеки елемент е отделна
 * бележка от същия файл (gdid = ID на файла).
 * Спираме при MAX_NOTE_FILES_ файла или при изчерпан бюджет по време
 * (проверява се между партидите) — тогава `capped: true` с частични резултати.
 */
function loadNotes_(folder, run) {
    var t0 = Date.now();
    var collected = collectFiles_(folder, 'note.txt', MAX_NOTE_FILES_);
    run.timing.filesListMs += Date.now() - t0;
    var loaded = loadNotesFromRecords_(collected.records, run);
    if (collected.capped) loaded.capped = true;
    return loaded;
}

/**
 * Чете и парсва дадените note.txt записи (от пълното сканиране или от
 * индекса) — един и същ код и за двата пътя, затова резултатите са еднакви.
 */
function loadNotesFromRecords_(records, run) {
    var seen = {};
    var notes = [];
    var corrupt = 0;
    var texts = readFilesTextBatch_(records, {
        token: run.token, batch: run.batch, started: run.started, budget: run.budget, timing: run.timing
    });
    var capped = texts.length < records.length;
    for (var n = 0; n < texts.length; n++) {
        var fileId = records[n].id;
        var items = texts[n] === null ? null : parseItems_(texts[n]);
        if (!items) { corrupt++; continue; }
        var multi = items.length > 1;
        items.forEach(function (item, idx) {
            item.gdid = fileId;
            var key = multi ? fileId + ':' + (item.id !== undefined ? item.id : idx) : fileId;
            if (seen[key]) return;
            seen[key] = true;
            notes.push(item);
        });
    }
    return { notes: notes, noteFiles: texts.length, totalFiles: records.length, corrupt: corrupt, capped: capped };
}

// =================================================================================
// Бордове
// =================================================================================

function findBoard_(boards, boardid) {
    if (boardid === undefined || boardid === null || boardid === '') return null;
    var id = String(boardid);
    for (var i = 0; i < boards.length; i++) {
        if (boards[i].gdid && String(boards[i].gdid) === id) return boards[i];
    }
    for (var j = 0; j < boards.length; j++) {
        if (boards[j].id !== undefined && String(boards[j].id) === id) return boards[j];
    }
    return null;
}

/**
 * `board` може да е заглавие (без значение от главни/малки букви) или
 * id/gdid. Връща множество от всички id-та, с които бележка може да сочи борда.
 */
function resolveBoardIds_(boards, param) {
    var set = {};
    set[param] = true;
    var lower = param.toLowerCase();
    boards.forEach(function (b) {
        var titleHit = b.title && String(b.title).trim().toLowerCase() === lower;
        var idHit = (b.gdid && String(b.gdid) === param) || (b.id !== undefined && String(b.id) === param);
        if (titleHit || idHit) {
            if (b.gdid) set[String(b.gdid)] = true;
            if (b.id !== undefined && b.id !== null && b.id !== '') set[String(b.id)] = true;
        }
    });
    return set;
}

// =================================================================================
// Заглавие, текст и търсене
// =================================================================================

/**
 * Опростен вариант на window.getPipeIndex от uni/main.js: първият `|` извън
 * {{код}} и ```код```. Бележка, която започва с markdown таблица, няма
 * разделител заглавие|текст.
 */
function pipeIndex_(text) {
    if (!text) return -1;
    var firstLine = '';
    var lines = text.split('\n');
    for (var l = 0; l < lines.length; l++) {
        if (lines[l].trim()) { firstLine = lines[l].trim(); break; }
    }
    if (firstLine.charAt(0) === '|') return -1;
    var inCode = false;
    var inBacktick = false;
    for (var i = 0; i < text.length; i++) {
        if (text.substring(i, i + 2) === '{{') { inCode = true; i++; }
        else if (text.substring(i, i + 2) === '}}') { inCode = false; i++; }
        else if (text.substring(i, i + 3) === '```') { inBacktick = !inBacktick; i += 2; }
        else if (text.charAt(i) === '|' && !inCode && !inBacktick) return i;
    }
    return -1;
}

function splitFirstLine_(text) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].trim()) {
            return { title: lines[i].trim(), body: lines.slice(i + 1).join('\n') };
        }
    }
    return { title: '', body: '' };
}

/**
 * Извежда { title, body, text } така, както ги показва приложението.
 * При скрита бележка (pass: true) скритата част след `|` НЕ се търси и
 * НЕ се връща — участва само видимото превю.
 */
function noteParts_(note) {
    var raw = String(note.notetxt == null ? '' : note.notetxt).replace(/\r\n/g, '\n');
    var pipe = pipeIndex_(raw);
    var parts;
    if (note.pass === true) {
        var preview = pipe !== -1 ? raw.substring(0, pipe).trim() : '';
        parts = splitFirstLine_(preview);
        return { title: parts.title, body: parts.body, text: preview };
    }
    if (pipe !== -1) {
        return { title: raw.substring(0, pipe).trim(), body: raw.substring(pipe + 1), text: raw };
    }
    parts = splitFirstLine_(raw);
    return { title: parts.title, body: parts.body, text: raw };
}

/**
 * Всички думи трябва да се срещат (в заглавието или в текста).
 * Сравнението е с toLowerCase() от двете страни — работи и за кирилица.
 */
function matchNote_(note, words) {
    var p = noteParts_(note);
    var titleL = p.title.toLowerCase();
    var bodyL = p.body.toLowerCase();
    var titleHit = false;
    var bodyHit = false;
    for (var i = 0; i < words.length; i++) {
        var inTitle = titleL.indexOf(words[i]) !== -1;
        var inBody = bodyL.indexOf(words[i]) !== -1;
        if (!inTitle && !inBody) return null;
        if (inTitle) titleHit = true;
        if (inBody) bodyHit = true;
    }
    return {
        note: note,
        parts: p,
        words: words,
        titleHit: titleHit,
        matchIn: titleHit && bodyHit ? 'both' : (titleHit ? 'title' : 'text'),
        sortTime: Number(note.datemod) || Number(note.date) || 0
    };
}

function escapeRegExp_(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ~200 знака около ПЪРВОТО съвпадение, като съвпадението винаги е цяло.
 */
function makeSnippet_(text, words) {
    var pos = -1;
    var len = 0;
    for (var i = 0; i < words.length; i++) {
        var m = new RegExp(escapeRegExp_(words[i]), 'iu').exec(text);
        if (m && (pos === -1 || m.index < pos)) { pos = m.index; len = m[0].length; }
    }
    if (pos === -1) {
        return text.length > SNIPPET_LEN_ ? text.substring(0, SNIPPET_LEN_) + '…' : text;
    }
    var windowLen = Math.max(SNIPPET_LEN_, len);
    var start = Math.max(0, pos - Math.floor((windowLen - len) / 2));
    var end = Math.min(text.length, start + windowLen);
    start = Math.max(0, end - windowLen);
    return (start > 0 ? '…' : '') + text.substring(start, end) + (end < text.length ? '…' : '');
}

/**
 * Резултатът съдържа САМО изброените полета — нищо друго от обекта на
 * бележката (pass, uiState, ...) не излиза навън.
 */
function buildResult_(m, boards) {
    var note = m.note;
    var board = findBoard_(boards, note.boardid);
    var gdid = String(note.gdid);
    return {
        id: note.id === undefined ? null : note.id,
        gdid: gdid,
        title: m.parts.title,
        board: board && board.title ? String(board.title) : null,
        boardId: note.boardid === undefined ? null : note.boardid,
        date: formatDay_(noteTimestamp_(note)) || null,
        modified: formatDateTime_(Number(note.datemod) || Number(note.date) || 0) || null,
        matchIn: m.matchIn,
        snippet: makeSnippet_(m.parts.text, m.words),
        text: m.parts.text,
        driveUrl: 'https://drive.google.com/file/d/' + encodeURIComponent(gdid) + '/view'
    };
}

// =================================================================================
// Дати (в милисекунди, както `date` / `datemod` в приложението)
// =================================================================================

/** Датата на бележката: `date` (създаване), с fallback към `datemod`. */
function noteTimestamp_(note) {
    return Number(note.date) || Number(note.datemod) || 0;
}

function formatDay_(ts) {
    if (!ts) return '';
    return Utilities.formatDate(new Date(ts), TIME_ZONE_, 'yyyy-MM-dd');
}

function formatDateTime_(ts) {
    if (!ts) return '';
    return Utilities.formatDate(new Date(ts), TIME_ZONE_, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
