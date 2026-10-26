// Сметката на „X върху плочката“: махане на вградена снимка (type=8) от текста на бележката.
// Проверява СЪЩАТА функция от uni/main.js (извадена от файла, не преписана): трие ли се точно
// знакът на снимката, остават ли останалите формати върху същите думи и сочи ли следващата снимка
// пак своя знак.
// Пускане: node .bolter/check/attach-delete-marker-math.mjs   (MAIN=път до друг main.js при нужда)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN = process.env.MAIN || path.join(here, '..', '..', 'uni', 'main.js');
const src = readFileSync(MAIN, 'utf8');

// Изважда една функция от main.js по балансирани скоби - така тестът върви върху истинския код.
const grab = (name) => {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`няма function ${name} в ${MAIN}`);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`незатворена function ${name}`);
};

const api = new Function(
    `${grab('inlineImageName')}\n${grab('nmInlineFirstNonSpace')}\n${grab('nmCutInlineImageFromField')}\n` +
    'return { inlineImageName, nmInlineFirstNonSpace, nmCutInlineImageFromField };'
)();

const { nmCutInlineImageFromField, nmInlineFirstNonSpace, inlineImageName } = api;

let fails = 0;
let n = 0;
const ok = (cond, message, extra) => {
    n++;
    if (!cond) {
        fails++;
        console.log('FAIL', message);
        if (extra !== undefined) console.log('     ', typeof extra === 'string' ? extra : JSON.stringify(extra));
    } else {
        console.log('ok  ', message);
    }
};
const img = (start, paramstring, paramint = 3) => ({ start, end: start + 1, type: 8, paramint, paramstring });
const covers = (text, f) => text.slice(f.start, f.end);
const clones = (formats) => formats.map(f => ({ ...f }));

// --- 1. Тяло с ДВЕ вградени снимки: маха се първата ------------------------------------------
{
    const A = 'Снимка';
    const B = 'после';
    const C = 'край';
    const body = `Ето ${A} * ${B} * ${C}`;
    const p1 = body.indexOf('*');
    const p2 = body.indexOf('*', p1 + 1);
    const iA = body.indexOf(A);
    const iB = body.indexOf(B);
    const formats = [
        { start: iA, end: iA + A.length, type: 1 }, // удебелено
        img(p1, 'One.jpg'),
        { start: iB, end: iB + B.length, type: 4, paramint: 2 }, // цвят
        img(p2, '/storage/emulated/0/Images/Two.jpg', 5)
    ];
    const before = clones(formats);
    const res = nmCutInlineImageFromField(body, formats, 'One.jpg');
    const kept = res.formats;

    ok(res.removed === 1, '(1) махнато е точно едно място', res.removed);
    ok(res.text === `Ето ${A}  ${B} * ${C}`, '(1) от текста е изчезнал само знакът на първата снимка', res.text);
    ok(kept.length === 3, '(1) остават три формата (удебелено, цвят, втората снимка)', kept);
    const bold = kept.find(f => f.type === 1);
    ok(!!bold && covers(res.text, bold) === A, '(1) удебеленото покрива същата дума', bold && covers(res.text, bold));
    const colour = kept.find(f => f.type === 4);
    ok(!!colour && covers(res.text, colour) === B, '(1) цветът покрива същата дума', colour && covers(res.text, colour));
    const second = kept.find(f => f.type === 8);
    ok(!!second && res.text[second.start] === '*' && covers(res.text, second) === '*',
        '(1) втората снимка сочи пак своя знак', second && { fmt: second, char: res.text[second.start] });
    ok(!!second && inlineImageName(second.paramstring) === 'Two.jpg', '(1) втората снимка е все още Two.jpg');
    ok(!!second && second.paramint === 5, '(1) ширината на втората снимка не е мръднала');
    ok(!kept.some(f => f.type === 8 && inlineImageName(f.paramstring) === 'One.jpg'), '(1) диапазонът на махнатата снимка го няма');
    ok(formats.every((f, i) => f.start === before[i].start && f.end === before[i].end), '(1) подадените формати не се пипат навън (копие)');
    ok(res.caret === p1, '(1) каретата застава на мястото на махнатия знак', res.caret);
}

// --- 2. Снимка в самото начало: триенето на нулевия знак измества всичко останало ------------
{
    const body = '* следващ текст';
    const formats = [img(0, 'Start.jpg'), { start: 2, end: 9, type: 1 }];
    const res = nmCutInlineImageFromField(body, formats, 'Start.jpg');
    ok(res.removed === 1 && res.text === ' следващ текст', '(2) знакът на първа позиция е махнат', res.text);
    ok(res.formats.length === 1 && covers(res.text, res.formats[0]) === 'следващ', '(2) удебеленото пак покрива същата дума', res.formats);
}

// --- 3. Един и същ файл на две места: махат се и двете ---------------------------------------
{
    const body = 'едно * две * три';
    const p1 = body.indexOf('*');
    const p2 = body.indexOf('*', p1 + 1);
    const formats = [img(p1, 'Same.jpg'), { start: p1 + 2, end: p1 + 5, type: 1 }, img(p2, 'Same.jpg')];
    const res = nmCutInlineImageFromField(body, formats, 'Same.jpg');
    ok(res.removed === 2, '(3) махнати са две места', res.removed);
    ok(!res.text.includes('*'), '(3) в текста не е останал знак на снимка', res.text);
    ok(res.text === 'едно  две  три', '(3) текстът е без двата знака', res.text);
    ok(res.formats.length === 1 && covers(res.text, res.formats[0]) === 'две', '(3) удебеленото пак покрива думата си', res.formats);
}

// --- 4. Формат точно върху знака на снимката остава празен и пада ----------------------------
{
    const body = 'тук * там';
    const p = body.indexOf('*');
    const formats = [img(p, 'On.jpg'), { start: p, end: p + 1, type: 2 }]; // курсив точно върху знака
    const res = nmCutInlineImageFromField(body, formats, 'On.jpg');
    ok(res.removed === 1 && res.text === 'тук  там', '(4) знакът е махнат', res.text);
    ok(res.formats.length === 0, '(4) празният диапазон не остава (не би покривал нищо)', res.formats);
}

// --- 5. Диапазон с интервали около знака: трие се само знакът --------------------------------
{
    const body = 'а *  б';
    const p = body.indexOf('*');
    // Диапазонът на снимката покрива " * " (интервал, знак, интервал) - трие се само знакът.
    const formats = [
        { start: p - 1, end: p + 2, type: 8, paramint: 3, paramstring: 'Space.jpg' },
        { start: p - 1, end: p + 2, type: 1 }
    ];
    const res = nmCutInlineImageFromField(body, formats, 'Space.jpg', inlineImageName);
    ok(res.removed === 1 && res.text === 'а   б', '(5) махнат е само знакът, интервалите остават', res.text);
    ok(res.formats.length === 1 && !covers(res.text, res.formats[0]).includes('*'),
        '(5) удебеленото покрива същите интервали, без знака', res.formats);
    ok(nmInlineFirstNonSpace(body, p - 1, p + 2) === p, '(5) рамката се рисува на първия неинтервален знак');
}

// --- 6. Друго име и заглавие: нищо не се пипа -------------------------------------------------
{
    const body = 'текст * край';
    const formats = [img(body.indexOf('*'), '/storage/emulated/0/Images/Other.jpg'), { start: 0, end: 5, type: 1 }];
    const res = nmCutInlineImageFromField(body, formats, 'Missing.jpg');
    ok(res.removed === 0 && res.text === body, '(6) несъществуващо име не пипа текста', res.text);
    ok(res.formats.length === 2 && res.formats[0].start === formats[0].start, '(6) форматите остават както са');
    const empty = nmCutInlineImageFromField('', [], 'One.jpg');
    ok(empty.removed === 0 && empty.text === '', '(6) празно поле не гърми');
}

// --- 7. Заглавие и тяло: отместванията са на всяко поле поотделно -----------------------------
// (text_span се брои след '|', затова заглавието се реже със своите формати - разделителят не
// влиза в сметката нито веднъж.)
{
    const title = 'Заглавие *';
    const body = 'тяло * край';
    const titleFormats = [img(title.indexOf('*'), 'Title.jpg')];
    const bodyFormats = [img(body.indexOf('*'), 'Body.jpg'), { start: 0, end: 4, type: 1 }];
    const t = nmCutInlineImageFromField(title, titleFormats, 'Title.jpg');
    const b = nmCutInlineImageFromField(body, bodyFormats, 'Body.jpg');
    ok(t.removed === 1 && b.removed === 1, '(7) махнато е по веднъж в заглавието и в тялото');
    ok(t.text + '|' + b.text === 'Заглавие |тяло  край', '(7) съединено със „|“ дава правилния запис', t.text + '|' + b.text);
    ok(b.formats.length === 1 && covers(b.text, b.formats[0]) === 'тяло', '(7) форматите на тялото сочат същите знаци', b.formats);
}

console.log(`\n${n - fails}/${n} проверки минаха${fails ? `, ${fails} ПАДНАХА` : ''}`);
process.exit(fails ? 1 : 0);
