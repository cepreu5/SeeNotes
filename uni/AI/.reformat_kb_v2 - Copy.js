const fs = require('fs');
const path = 'kb-template.txt';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Repair unquoted keys to parse
    content = content.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    content = content.replace(/,(\s*[}\]])/g, '$1');

    let data;
    try {
        data = JSON.parse(content);
    } catch (e) {
        console.error("JSON Parse failed:", e);
        process.exit(1);
    }

    function format(obj, indent = 0) {
        const space = ' '.repeat(indent);
        const inner = ' '.repeat(indent + 4);

        if (obj === null) return 'null';

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';
            if (typeof obj[0] !== 'object') {
                return JSON.stringify(obj);
            }
            const parts = obj.map(item => format(item, indent + 4));
            return '[\n' + parts.join(',\n') + '\n' + space + ']';
        }

        if (typeof obj === 'object') {
            if (obj.x !== undefined || obj.image !== undefined || (obj.target && Object.keys(obj).length > 2)) {
                return formatGuide(obj, indent);
            }

            const keys = Object.keys(obj);
            if (keys.length === 0) return '{}';

            let parts = [];
            for (const key of keys) {
                parts.push(`${inner}"${key}": ${format(obj[key], indent + 4)}`);
            }
            return '{\n' + parts.join(',\n') + '\n' + space + '}';
        }

        return JSON.stringify(obj);
    }

    function formatGuide(g, indent) {
        const s = ' '.repeat(indent);
        const i = ' '.repeat(indent + 4); // Indent for properties

        let lines = [];

        // Line 1: Image, Height
        let visuals = [];
        if (g.image) visuals.push(`"image": "${g.image}"`);
        if (g.height) visuals.push(`"height": ${g.height}`);
        if (visuals.length) lines.push(i + visuals.join(', '));

        // Line 2: Coords (unquoted)
        let coords = [];
        ['x', 'y', 'bx', 'by', 'bWidth', 'bHeight'].forEach(k => {
            if (g[k] !== undefined) coords.push(`${k}: ${g[k]}`);
        });
        if (coords.length) lines.push(i + coords.join(', '));

        // Line 3: Target (Separated)
        if (g.target) {
            lines.push(i + `"target": ${JSON.stringify(g.target)}`);
        }

        // Line 4: Rest logic
        let logic = [];
        const handled = ['image', 'height', 'x', 'y', 'bx', 'by', 'bWidth', 'bHeight', 'target'];
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
