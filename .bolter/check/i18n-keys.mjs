#!/usr/bin/env node
/**
 * i18n key audit for uni/.
 *
 * Plain Node ESM, no dependencies, no browser. Reads files with fs and exits 1
 * with a readable report on any failure.
 *
 * Why this exists: the header tooltips used to point data-key-title at English
 * *display text* ("Mode", "Reload", "Settings"), so setLanguage() looked up a key
 * that did not exist and put the raw string back as the tooltip - half the
 * tooltips were then Bulgarian, half English, and none of them followed the
 * selected language. `_('goToBoard')` had the same problem from the other side:
 * a real key that was never added to the language files, so the board-name
 * tooltip literally showed "goToBoard". This check makes both mistakes loud.
 *
 * Rules:
 *  1. every key referenced as _('key') / _("key") in uni/main.js and every
 *     data-key / data-key-title / data-key-placeholder / data-key-aria-label
 *     value in uni/index-2.html exists in ALL of uni/lang/i18n-{en,bg,ru}.json
 *  2. the three i18n files have identical key sets, and so do the three
 *     index-*.json files
 *  3. every data-key* value in uni/index.html exists in all three index-*.json
 *  4. no data-key* value anywhere contains a space (English display text used as
 *     a key is exactly how the tooltip bug happened)
 *  5. no _('key') || '<literal>' fallback in uni/main.js contains Cyrillic, and
 *     no static title= / placeholder= / aria-label= value in uni/index-2.html
 *     contains Cyrillic (fallbacks are English-only)
 *  6. all language files parse, and a small set of must-have keys is present
 *
 * Commented-out markup is ignored: it is never rendered, so setLanguage() never
 * sees it. Offsets are preserved when comments are blanked, so reported line
 * numbers stay exact.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const JS = 'uni/main.js';
const INDEX2 = 'uni/index-2.html';
const LANDING = 'uni/index.html';
const LANGS = ['en', 'bg', 'ru'];
const I18N = LANGS.map((l) => `uni/lang/i18n-${l}.json`);
const INDEX_LANG = LANGS.map((l) => `uni/lang/index-${l}.json`);

const REQUIRED_KEYS = [
  'goToBoard',
  'prevNoteTooltip',
  'nextNoteTooltip',
  'settingsButtonTooltip',
  'openFromDriveTooltip',
];

const CYRILLIC = /[\u0400-\u04FF]/;

const violations = [];
const v = (file, line, rule, msg) => violations.push({ file, line, rule, msg });

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** Blank out <!-- ... --> keeping newlines, so offsets (and line numbers) survive. */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

function loadJson(rel) {
  let text;
  try {
    text = read(rel);
  } catch (e) {
    v(rel, 0, 'json', `cannot be read: ${e.message}`);
    return null;
  }
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      v(rel, 1, 'json', 'top level is not a JSON object');
      return null;
    }
    return obj;
  } catch (e) {
    v(rel, 0, 'json', `does not parse as JSON: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------- collect keys

/** { key -> first line } for _('key') calls in main.js */
function collectJsKeys(rel) {
  const src = read(rel);
  const out = new Map();
  const re = /(^|[^\w$.])_\(\s*(['"])([^'"\n]+)\2\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[3];
    const at = m.index + m[1].length;
    if (!out.has(key)) out.set(key, lineOf(src, at));
  }
  return out;
}

/** { key -> first line } for data-key / data-key-title / -placeholder / -aria-label */
function collectHtmlKeys(rel) {
  const src = stripHtmlComments(read(rel));
  const out = new Map();
  const re = /\bdata-key(?:-title|-placeholder|-aria-label)?\s*=\s*(["'])([^"']*)\1/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[2];
    if (!out.has(key)) out.set(key, lineOf(src, m.index));
  }
  return out;
}

// ----------------------------------------------------------------------- rules

const i18n = {};
for (const rel of I18N) i18n[rel] = loadJson(rel);
const indexLang = {};
for (const rel of INDEX_LANG) indexLang[rel] = loadJson(rel);

const jsKeys = collectJsKeys(JS);
const htmlKeys = collectHtmlKeys(INDEX2);
const landingKeys = collectHtmlKeys(LANDING);

// 1 + 3: every referenced key exists in every language file of its family.
function checkPresent(refs, dicts, ruleLabel) {
  for (const [key, line] of refs) {
    for (const [rel, obj] of Object.entries(dicts)) {
      if (!obj) continue; // parse failure already reported
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        const file = ruleLabel.src;
        v(file, line, ruleLabel.rule, `key "${key}" is used here but missing from ${rel}`);
      }
    }
  }
}
checkPresent(jsKeys, i18n, { src: JS, rule: 'missing-key' });
checkPresent(htmlKeys, i18n, { src: INDEX2, rule: 'missing-key' });
checkPresent(landingKeys, indexLang, { src: LANDING, rule: 'missing-key' });

// 2: identical key sets inside each family.
function checkSameKeys(dicts, label) {
  const entries = Object.entries(dicts).filter(([, o]) => o);
  if (entries.length < 2) return;
  const [firstRel, firstObj] = entries[0];
  const firstKeys = new Set(Object.keys(firstObj));
  for (const [rel, obj] of entries.slice(1)) {
    const keys = new Set(Object.keys(obj));
    for (const k of firstKeys) {
      if (!keys.has(k)) v(rel, 0, 'key-set', `${label}: key "${k}" exists in ${firstRel} but not here`);
    }
    for (const k of keys) {
      if (!firstKeys.has(k)) v(firstRel, 0, 'key-set', `${label}: key "${k}" exists in ${rel} but not here`);
    }
  }
}
checkSameKeys(i18n, 'i18n');
checkSameKeys(indexLang, 'index');

// 4: no key may contain a space - a display string is not a key.
for (const [label, refs] of [
  [INDEX2, htmlKeys],
  [LANDING, landingKeys],
  [JS, jsKeys],
]) {
  for (const [key, line] of refs) {
    if (/\s/.test(key)) {
      v(label, line, 'space-in-key', `"${key}" contains whitespace - that is display text, not a translation key`);
    }
  }
}

// 5a: no Cyrillic in an _('key') || '<literal>' fallback.
{
  const src = read(JS);
  const re = /_\(\s*(['"])([^'"\n]+)\1\s*\)\s*\|\|\s*(['"`])((?:[^\\'"`\n]|\\.)*)\3/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (CYRILLIC.test(m[4])) {
      v(JS, lineOf(src, m.index), 'cyrillic-fallback',
        `fallback for "${m[2]}" is not English: ${JSON.stringify(m[4])}`);
    }
  }
}

// 5b: no Cyrillic in a static title= / placeholder= / aria-label= value.
{
  const src = stripHtmlComments(read(INDEX2));
  const re = /\b(title|placeholder|aria-label)\s*=\s*(["'])([^"']*)\2/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (CYRILLIC.test(m[3])) {
      v(INDEX2, lineOf(src, m.index), 'cyrillic-attribute',
        `static ${m[1]}="${m[3]}" is not English`);
    }
  }
}

// 6: required keys present everywhere.
for (const [rel, obj] of Object.entries(i18n)) {
  if (!obj) continue;
  for (const key of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      v(rel, 0, 'required-key', `required key "${key}" is missing`);
    }
  }
}

// ---------------------------------------------------------------------- report

const perLang = I18N.map((rel) => {
  const obj = i18n[rel];
  return `${path.basename(rel)}=${obj ? Object.keys(obj).length : 'n/a'}`;
}).join(' ');

const summary =
  `keys used: main.js=${jsKeys.size}  index-2.html=${htmlKeys.size}  index.html=${landingKeys.size}\n` +
  `keys per language: ${perLang}\n` +
  `index-*.json keys: ${INDEX_LANG.map((rel) => `${path.basename(rel)}=${indexLang[rel] ? Object.keys(indexLang[rel]).length : 'n/a'}`).join(' ')}`;

console.log(summary);
console.log('');

if (violations.length === 0) {
  console.log('PASS  i18n key audit: no violations');
  process.exit(0);
}

// Group by rule so the report reads as a list of problems, not a wall of lines.
const byRule = new Map();
for (const item of violations) {
  if (!byRule.has(item.rule)) byRule.set(item.rule, []);
  byRule.get(item.rule).push(item);
}
for (const [rule, items] of byRule) {
  console.log(`FAIL  [${rule}] ${items.length} violation(s)`);
  for (const it of items) {
    console.log(`  ${it.file}:${it.line}: ${it.msg}`);
  }
  console.log('');
}
console.log(`FAIL  i18n key audit: ${violations.length} violation(s)`);
process.exit(1);
