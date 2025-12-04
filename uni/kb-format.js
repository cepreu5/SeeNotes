const fs = require('fs');

// Чете JSON файла
const rawData = fs.readFileSync('kb-template.json', 'utf8');
// Премахва BOM ако има
const cleanData = rawData.replace(/^\uFEFF/, '');
const data = JSON.parse(cleanData);

// Функция за компактно форматиране на keywords масиви
function formatKeywords(obj, indent = 0) {
    const spaces = '  '.repeat(indent);

    if (Array.isArray(obj)) {
        // За keywords масиви - всички на един ред
        const items = obj.map(item => JSON.stringify(item)).join(', ');
        return `[${items}]`;
    }

    if (typeof obj === 'object' && obj !== null) {
        const entries = Object.entries(obj);
        const lines = entries.map(([key, value]) => {
            if (key === 'keywords' && typeof value === 'object') {
                // Специално форматиране за keywords
                const bg = formatKeywords(value.bg, 0);
                const en = formatKeywords(value.en, 0);
                return `${spaces}  "keywords": {\n${spaces}    "bg": ${bg},\n${spaces}    "en": ${en}\n${spaces}  }`;
            } else if (Array.isArray(value)) {
                return `${spaces}  "${key}": ${formatKeywords(value, indent + 1)}`;
            } else if (typeof value === 'object' && value !== null) {
                return `${spaces}  "${key}": ${JSON.stringify(value, null, 2).split('\n').map((line, i) => i === 0 ? line : spaces + '  ' + line).join('\n')}`;
            } else {
                return `${spaces}  "${key}": ${JSON.stringify(value)}`;
            }
        });
        return `{\n${lines.join(',\n')}\n${spaces}}`;
    }

    return JSON.stringify(obj);
}

// Ръчно форматиране за по-добър контрол
let output = '{\n';
output += '  "metadata": ' + JSON.stringify(data.metadata, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n') + ',\n';
output += '  "settings": [\n';

data.settings.forEach((setting, i) => {
    output += '    {\n';
    Object.entries(setting).forEach(([key, value], j) => {
        const comma = j < Object.entries(setting).length - 1 ? ',' : '';

        if (key === 'keywords') {
            const bg = JSON.stringify(value.bg);
            const en = JSON.stringify(value.en);
            output += `      "keywords": {\n`;
            output += `        "bg": ${bg},\n`;
            output += `        "en": ${en}\n`;
            output += `      }${comma}\n`;
        } else if (key === 'label' || key === 'question' || key === 'answer') {
            output += `      "${key}": {\n`;
            output += `        "bg": ${JSON.stringify(value.bg)},\n`;
            output += `        "en": ${JSON.stringify(value.en)}\n`;
            output += `      }${comma}\n`;
        } else if (Array.isArray(value)) {
            output += `      "${key}": ${JSON.stringify(value)}${comma}\n`;
        } else if (typeof value === 'object' && value !== null) {
            output += `      "${key}": ${JSON.stringify(value)}${comma}\n`;
        } else {
            output += `      "${key}": ${JSON.stringify(value)}${comma}\n`;
        }
    });
    const settingComma = i < data.settings.length - 1 ? ',' : '';
    output += `    }${settingComma}\n`;
});

output += '  ],\n';
output += '  "ui": [\n';

data.ui.forEach((item, i) => {
    output += '    {\n';
    Object.entries(item).forEach(([key, value], j) => {
        const comma = j < Object.entries(item).length - 1 ? ',' : '';

        if (key === 'keywords') {
            const bg = JSON.stringify(value.bg);
            const en = JSON.stringify(value.en);
            output += `      "keywords": {\n`;
            output += `        "bg": ${bg},\n`;
            output += `        "en": ${en}\n`;
            output += `      }${comma}\n`;
        } else if (key === 'label' || key === 'description') {
            output += `      "${key}": {\n`;
            output += `        "bg": ${JSON.stringify(value.bg)},\n`;
            output += `        "en": ${JSON.stringify(value.en)}\n`;
            output += `      }${comma}\n`;
        } else {
            output += `      "${key}": ${JSON.stringify(value)}${comma}\n`;
        }
    });
    const itemComma = i < data.ui.length - 1 ? ',' : '';
    output += `    }${itemComma}\n`;
});

output += '  ],\n';
output += '  "general": [\n';

data.general.forEach((item, i) => {
    output += '    {\n';
    Object.entries(item).forEach(([key, value], j) => {
        const comma = j < Object.entries(item).length - 1 ? ',' : '';

        if (key === 'keywords') {
            const bg = JSON.stringify(value.bg);
            const en = JSON.stringify(value.en);
            output += `      "keywords": {\n`;
            output += `        "bg": ${bg},\n`;
            output += `        "en": ${en}\n`;
            output += `      }${comma}\n`;
        } else if (key === 'question' || key === 'answer') {
            output += `      "${key}": {\n`;
            output += `        "bg": ${JSON.stringify(value.bg)},\n`;
            output += `        "en": ${JSON.stringify(value.en)}\n`;
            output += `      }${comma}\n`;
        } else {
            output += `      "${key}": ${JSON.stringify(value)}${comma}\n`;
        }
    });
    const itemComma = i < data.general.length - 1 ? ',' : '';
    output += `    }${itemComma}\n`;
});

output += '  ]\n';
output += '}\n';

// Записва форматирания файл
fs.writeFileSync('kb-template.json', output, 'utf8');
console.log('✅ Formatted! Keywords are now on single lines.');
