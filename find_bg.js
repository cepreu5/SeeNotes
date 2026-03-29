const fs = require('fs');
let content = fs.readFileSync('c:/Projects/SeeNotes/uni/main.js', 'utf8');

// Remove comments so we only inspect real code strings
content = content.replace(/\/\/.*$/gm, '');
content = content.replace(/\/\*[\s\S]*?\*\//g, '');

const regex = /(['"`])(.*?)\1/g;
const cyrillic = /[А-Яа-я]/;

let match;
let count = 0;
while ((match = regex.exec(content)) !== null) {
    let str = match[2];
    if (cyrillic.test(str)) {
        // Exclude console.log/console.error texts
        if (!str.includes('Проблем със') && !str.includes('Грешка при') && !str.includes('НЕВАЛИДЕН') && !str.includes('ВАЛИДЕН')) {
           console.log(`Found Cyrillic string: ${match[1]}${str}${match[1]}`);
           count++;
        }
    }
}
console.log(`Total non-comment Cyrillic strings found: ${count}`);
