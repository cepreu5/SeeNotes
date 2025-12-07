const fs = require('fs');
const content = fs.readFileSync('c:/Projects/SeeNotes/uni/kb-template.txt', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.trim().startsWith('"id":')) {
        // Look backwards for {
        let prevLineIndex = index - 1;
        while (prevLineIndex >= 0 && lines[prevLineIndex].trim() === '') {
            prevLineIndex--;
        }

        if (prevLineIndex >= 0) {
            const prevLine = lines[prevLineIndex].trim();
            if (prevLine !== '{' && !prevLine.endsWith('{')) {
                console.log(`Potential missing { at line ${index + 1}. Previous line: '${prevLine}'`);
            }
        }
    }
});
