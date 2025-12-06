const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'kb-template.txt');

try {
    const text = fs.readFileSync(filePath, 'utf8');

    // Find start of settings array
    const settingsStart = text.indexOf('"settings": [');
    if (settingsStart === -1) throw new Error("Settings not found");

    const arrayOpenIndex = text.indexOf('[', settingsStart);

    // Find matching close bracket
    let bracketCount = 0;
    let arrayEndIndex = -1;
    let inString = false;

    for (let i = arrayOpenIndex; i < text.length; i++) {
        let char = text[i];
        if (char === '"' && text[i - 1] !== '\\') inString = !inString;

        if (!inString) {
            if (char === '[') bracketCount++;
            if (char === ']') bracketCount--;

            if (bracketCount === 0) {
                arrayEndIndex = i;
                break;
            }
        }
    }

    if (arrayEndIndex === -1) throw new Error("Array end not found");

    const before = text.substring(0, arrayOpenIndex + 1);
    const inner = text.substring(arrayOpenIndex + 1, arrayEndIndex);
    const after = text.substring(arrayEndIndex);

    // Split items by comma at level 0
    function splitItems(str) {
        let items = [];
        let start = 0;
        let bCount = 0;
        let inStr = false;

        for (let i = 0; i < str.length; i++) {
            let char = str[i];
            if (char === '"' && str[i - 1] !== '\\') inStr = !inStr;

            if (!inStr) {
                if (char === '{') bCount++;
                if (char === '}') bCount--;

                if (char === ',' && bCount === 0) {
                    items.push(str.substring(start, i));
                    start = i + 1;
                }
            }
        }
        items.push(str.substring(start));
        return items;
    }

    const rawItems = splitItems(inner)
        .map(s => s.trim())
        .filter(s => s.length > 0); // Remove empty chunks

    // Identify categories
    const parsedItems = rawItems.map(raw => {
        // Regex to find "category": "..."
        const match = raw.match(/"category"\s*:\s*"([^"]+)"/);
        const cat = match ? match[1] : 'unknown';
        return { raw, cat };
    });

    // Bucketize
    const groups = new Map();
    const order = [];

    parsedItems.forEach(item => {
        if (!groups.has(item.cat)) {
            groups.set(item.cat, []);
            order.push(item.cat);
        }
        groups.get(item.cat).push(item);
    });

    // Reorder Categories: Alphabetical, with data-management last
    // Use Set to get unique categories
    const uniqueCats = Array.from(new Set(order));

    uniqueCats.sort((a, b) => {
        if (a === 'data-management') return 1;
        if (b === 'data-management') return -1;
        return a.localeCompare(b);
    });

    // Flatten
    let resultItems = [];
    uniqueCats.forEach(cat => {
        resultItems = resultItems.concat(groups.get(cat));
    });

    // Join with ",\n"
    const newInner = '\n' + resultItems.map(i => i.raw).join(',\n') + '\n';

    // Reconstruct
    const newText = before + newInner + after;

    fs.writeFileSync(filePath, newText);
    console.log('Reordered blocks successfully');

} catch (e) {
    console.error(e);
}
