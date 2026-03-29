const fs = require('fs');

const loadJson = (path) => {
    try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return {}; }
}

const trans = {
    ...loadJson('c:/Projects/SeeNotes/multinotes/ui/lang/i18n-en.json'),
    ...loadJson('c:/Projects/SeeNotes/multinotes/ui/lang/index-en.json'),
    ...loadJson('c:/Projects/SeeNotes/multinotes/ui/lang/kb-en.json'),
    ...loadJson('c:/Projects/SeeNotes/multinotes/ui/lang/kb-core.json')
};

const jsFile = 'c:/Projects/SeeNotes/multinotes/ui/main.js';
let content = fs.readFileSync(jsFile, 'utf8');

// _('key') || 'Fallback'
const regex = /_\(\s*(['"])([^'"]+)\1\s*\)\s*\|\|\s*(['"`])([\s\S]*?)\3/g;

let count = 0;
content = content.replace(regex, (match, q1, key, q3, fallback) => {
    if (trans[key]) {
        count++;
        // Make sure to escape the quote type used for the new text
        const newText = trans[key]
            .replace(/\\/g, '\\\\')
            .replace(new RegExp(q3, 'g'), '\\' + q3)
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '');
            
        return `_(${q1}${key}${q1}) || ${q3}${newText}${q3}`;
    }
    return match;
});

fs.writeFileSync(jsFile, content, 'utf8');
console.log(`Replaced ${count} fallback strings in main.js.`);
