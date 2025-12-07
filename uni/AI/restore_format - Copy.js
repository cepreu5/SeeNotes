const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'kb-template.txt');

function customStringify(key, value, indentLevel) {
    const pad = ' '.repeat(indentLevel);
    const subPad = ' '.repeat(indentLevel + 4);

    if (Array.isArray(value)) {
        // Compact array of strings (keywords)
        if (value.length > 0 && typeof value[0] === 'string') {
            return '[' + value.map(s => JSON.stringify(s)).join(',') + ']';
        }
        if (value.length === 0) return '[]';

        // Normal array (settings list)
        // Check if elements are objects (settings)
        const items = value.map(v => customStringify(null, v, indentLevel + 4));
        return '[\n' + items.join(',\n') + '\n' + pad + ']';
    }

    if (typeof value === 'object' && value !== null) {
        // Detect GUIDE object
        // Use a heuristic: has 'target' and ('x' or 'y')
        if (value.target && (value.x !== undefined || value.y !== undefined)) {
            return formatGuide(value, pad);
        }

        const keys = Object.keys(value);
        const props = keys.map(k => {
            const v = value[k];
            return `"${k}": ${customStringify(k, v, indentLevel + 4)}`;
        });
        return '{\n' + props.map(p => subPad + p).join(',\n') + '\n' + pad + '}';
    }

    return JSON.stringify(value);
}

function formatGuide(g, pad) {
    const subPad = ' '.repeat(pad.length + 4);
    let parts = [];

    // Line 1: image, height
    let l1 = [];
    if (g.image) l1.push(`"image": ${JSON.stringify(g.image)}`);
    if (g.height) l1.push(`"height": ${g.height}`);
    if (l1.length) parts.push(subPad + l1.join(', '));

    // Line 2: Coords (Unquoted keys)
    let l2 = [];
    ['x', 'y', 'bx', 'by', 'bWidth', 'bHeight'].forEach(k => {
        if (g[k] !== undefined) l2.push(`${k}: ${g[k]}`);
    });
    if (l2.length) parts.push(subPad + l2.join(', '));

    // Line 3: target, stopAfter, etc
    let l3 = [];
    if (g.target) l3.push(`"target": ${JSON.stringify(g.target)}`);
    if (g.stopAfter !== undefined) l3.push(`"stopAfter": ${g.stopAfter}`);
    if (g.action) l3.push(`"action": ${JSON.stringify(g.action)}`);
    if (g.context) l3.push(`"context": ${JSON.stringify(g.context)}`);
    if (g.textKey !== undefined) l3.push(`"textKey": ${g.textKey}`);

    // Remainder
    Object.keys(g).forEach(k => {
        if (['image', 'height', 'x', 'y', 'bx', 'by', 'bWidth', 'bHeight', 'target', 'stopAfter', 'action', 'context', 'textKey'].includes(k)) return;
        l3.push(`"${k}": ${JSON.stringify(g[k])}`);
    });

    if (l3.length) parts.push(subPad + l3.join(', '));

    return '{\n' + parts.join(',\n') + '\n' + pad + '}';
}

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    const output = customStringify(null, data, 0);
    fs.writeFileSync(filePath, output);
    console.log('Restored format');
} catch (e) {
    console.error(e);
}
