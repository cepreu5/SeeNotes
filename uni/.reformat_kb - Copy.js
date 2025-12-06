const fs = require('fs');
const path = 'kb-template.txt';

try {
    let content = fs.readFileSync(path, 'utf8');

    // 1. Repair unquoted keys used in guide (x, y, bx...) to make it parseable JSON
    // Regex matches: { or , followed by key followed by :
    content = content.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

    // Remove potential trailing commas before closing braces (common issue)
    content = content.replace(/,(\s*[}\]])/g, '$1');

    let data;
    try {
        data = JSON.parse(content);
    } catch (e) {
        console.error("JSON Parse failed after repair:", e);
        // Try to dump snippet
        process.exit(1);
    }

    // 2. Custom Stringify
    function format(obj, indent = 0) {
        const space = ' '.repeat(indent);
        const inner = ' '.repeat(indent + 4);

        if (obj === null) return 'null';

        if (Array.isArray(obj)) {
            // Compact primitives (strings/numbers) on one line
            if (obj.length === 0) return '[]';
            if (typeof obj[0] !== 'object') {
                return JSON.stringify(obj);
            }
            // Array of objects (settings etc) - one per block
            const parts = obj.map(item => format(item, indent + 4));
            return '[\n' + parts.join(',\n') + '\n' + space + ']';
        }

        if (typeof obj === 'object') {
            // Check for Guide object (heuristic)
            if (obj.x !== undefined || obj.image !== undefined || (obj.target && Object.keys(obj).length > 2)) {
                return formatGuide(obj, indent);
            }

            // Standard object formatting
            const keys = Object.keys(obj);
            if (keys.length === 0) return '{}';

            // Check if it's a simple localization object (bg/en only key/vals)
            // and values are strings of moderate length?
            // User didn't request this, but it keeps things clean.
            // Let's stick to standard multiline for main objects.

            let parts = [];
            for (const key of keys) {
                // If value is array of strings (keywords), it will be single line due to array check above
                parts.push(`${inner}"${key}": ${format(obj[key], indent + 4)}`);
            }
            return '{\n' + parts.join(',\n') + '\n' + space + '}';
        }

        return JSON.stringify(obj);
    }

    function formatGuide(g, indent) {
        const s = ' '.repeat(indent);
        const i = ' '.repeat(indent + 4);

        let lines = [];

        // Group 1: Visuals
        let visuals = [];
        if (g.image) visuals.push(`"image": "${g.image}"`);
        if (g.height) visuals.push(`"height": ${g.height}`);
        if (visuals.length) lines.push(i + visuals.join(', '));

        // Group 2: Coords (unquoted)
        let coords = [];
        ['x', 'y', 'bx', 'by', 'bWidth', 'bHeight'].forEach(k => {
            if (g[k] !== undefined) coords.push(`${k}: ${g[k]}`);
        });
        if (coords.length) lines.push(i + coords.join(', '));

        // Group 3: Logic/Target
        let logic = [];
        const handled = ['image', 'height', 'x', 'y', 'bx', 'by', 'bWidth', 'bHeight'];
        for (const k in g) {
            if (!handled.includes(k)) {
                logic.push(`"${k}": ${JSON.stringify(g[k])}`);
            }
        }
        if (logic.length) lines.push(i + logic.join(', '));

        return '{\n' + lines.join(',\n') + '\n' + s + '}';
    }

    const output = format(data);
    fs.writeFileSync(path, output, 'utf8');
    console.log("Success");

} catch (err) {
    console.error("Script error:", err);
    process.exit(1);
}
