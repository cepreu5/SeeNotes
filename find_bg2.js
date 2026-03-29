const fs = require('fs');
const lines = fs.readFileSync('c:/Projects/SeeNotes/uni/main.js', 'utf8').split('\n');
const cyrillic = /[\u0400-\u04FF]/;
const results = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip comment-only lines
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    // Remove inline comments
    const noComment = trimmed.replace(/\/\/.*$/, '');
    // Check for cyrillic in string literals only
    const strRegex = /(['"`])((?:(?!\1).)*[\u0400-\u04FF](?:(?!\1).)*)\1/g;
    let m;
    while ((m = strRegex.exec(noComment)) !== null) {
        results.push({ line: i + 1, text: m[0] });
    }
}
results.forEach(r => console.log(`Line ${r.line}: ${r.text}`));
console.log(`\nTotal: ${results.length}`);
