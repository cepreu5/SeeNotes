const fs = require('fs');
const text = fs.readFileSync('kb-template.txt', 'utf8');

const regex = /(?:"category"|category)\s*:\s*"([^"]+)"/g;
let match;
const counts = {};
let total = 0;
while ((match = regex.exec(text)) !== null) {
    const cat = match[1];
    counts[cat] = (counts[cat] || 0) + 1;
    total++;
}
console.log(counts);
console.log("Total found:", total);
console.log("File len:", text.length);
