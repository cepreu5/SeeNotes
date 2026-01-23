/**
 * Script to split kb-data.txt into kb-core.json, kb-bg.json, and kb-en.json
 * Usage: node split-kb.js
 */

const fs = require('fs');
const path = require('path');

// Paths
const inputFile = path.join(__dirname, 'kb-data.txt');
const outputCore = path.join(__dirname, 'kb-core.json');
const outputBg = path.join(__dirname, 'kb-bg.json');
const outputEn = path.join(__dirname, 'kb-en.json');

console.log(`Reading from ${inputFile}...`);

if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
}

let rawData = fs.readFileSync(inputFile, 'utf8');

// 1. Cleanup JSON: Remove comments // ...
rawData = rawData.replace(/\/\/.*$/gm, '');

// 2. Cleanup JSON: Remove trailing commas before closing braces/brackets
rawData = rawData.replace(/,(\s*[}\]])/g, '$1');

let data;
try {
    data = JSON.parse(rawData);
} catch (e) {
    console.warn("Standard JSON parse failed (likely due to loose formatting). Trying eval...");
    try {
        // Fallback for loose JSON
        data = eval('(' + rawData + ')');
    } catch (e2) {
        console.error("Failed to parse data.", e2);
        process.exit(1);
    }
}

// Initialize structures
const core = {
    metadata: data.metadata,
    settings: [],
    general: []
};

const bg = {
    ui_texts: data.ui_texts ? data.ui_texts.bg : {},
    settings: {},
    general: {}
};

const en = {
    ui_texts: data.ui_texts ? data.ui_texts.en : {},
    settings: {},
    general: {}
};

// Helper to extract localized fields
function extractLoc(source, targetBg, targetEn, field) {
    if (source[field]) {
        if (source[field].bg) targetBg[field] = source[field].bg;
        if (source[field].en) targetEn[field] = source[field].en;
    }
}

// Helper to process guide object (separating structure from text)
function processGuide(guideSource, targetBg, targetEn) {
    const coreGuide = {};
    const bgGuide = {};
    const enGuide = {};
    let hasBg = false;
    let hasEn = false;

    // Iterate over keys in guide
    for (const key in guideSource) {
        const val = guideSource[key];

        // Check if key is a step number (1, 2, 3...)
        if (!isNaN(parseInt(key))) {
            // It's a step
            coreGuide[key] = { ...val };

            // Remove text from core step
            if (coreGuide[key].text) delete coreGuide[key].text;

            // Extract text to lang files
            if (val.text) {
                if (!bgGuide[key]) bgGuide[key] = {};
                if (!enGuide[key]) enGuide[key] = {};

                if (val.text.bg) { bgGuide[key].text = val.text.bg; hasBg = true; }
                if (val.text.en) { enGuide[key].text = val.text.en; hasEn = true; }
            }
        } else if (key === 'text') {
            // Direct text property in guide root
            if (val.bg) { bgGuide.text = val.bg; hasBg = true; }
            if (val.en) { enGuide.text = val.en; hasEn = true; }
        } else {
            // Structural property (image, x, y, target, etc.)
            coreGuide[key] = val;
        }
    }

    if (hasBg) targetBg.guide = bgGuide;
    if (hasEn) targetEn.guide = enGuide;

    return coreGuide;
}

// --- Process Settings ---
if (data.settings) {
    data.settings.forEach(item => {
        const coreItem = { ...item };
        const bgItem = {};
        const enItem = {};

        // Remove localized fields from core
        delete coreItem.label;
        delete coreItem.keywords;
        delete coreItem.question;
        delete coreItem.answer;
        delete coreItem.guide;

        // Extract
        extractLoc(item, bgItem, enItem, 'label');
        extractLoc(item, bgItem, enItem, 'keywords');
        extractLoc(item, bgItem, enItem, 'question');
        extractLoc(item, bgItem, enItem, 'answer');

        if (item.guide) {
            coreItem.guide = processGuide(item.guide, bgItem, enItem);
        }

        core.settings.push(coreItem);
        if (Object.keys(bgItem).length > 0) bg.settings[item.id] = bgItem;
        if (Object.keys(enItem).length > 0) en.settings[item.id] = enItem;
    });
}

// --- Process General ---
if (data.general) {
    data.general.forEach(item => {
        const coreItem = { ...item };
        const bgItem = {};
        const enItem = {};

        delete coreItem.keywords;
        delete coreItem.question;
        delete coreItem.answer;
        delete coreItem.guide;

        extractLoc(item, bgItem, enItem, 'keywords');
        extractLoc(item, bgItem, enItem, 'question');
        extractLoc(item, bgItem, enItem, 'answer');

        if (item.guide) {
            coreItem.guide = processGuide(item.guide, bgItem, enItem);
        }

        core.general.push(coreItem);
        if (Object.keys(bgItem).length > 0) bg.general[item.id] = bgItem;
        if (Object.keys(enItem).length > 0) en.general[item.id] = enItem;
    });
}

// Write files
fs.writeFileSync(outputCore, JSON.stringify(core, null, 4));
fs.writeFileSync(outputBg, JSON.stringify(bg, null, 4));
fs.writeFileSync(outputEn, JSON.stringify(en, null, 4));

console.log('✅ Conversion complete!');
console.log(`Created:\n - ${outputCore}\n - ${outputBg}\n - ${outputEn}`);
