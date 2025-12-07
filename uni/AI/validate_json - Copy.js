const fs = require('fs');
try {
    const content = fs.readFileSync('c:/Projects/SeeNotes/uni/kb-template.txt', 'utf8');
    JSON.parse(content);
    console.log('JSON is valid');
} catch (e) {
    console.log('JSON error:', e.message);
}
