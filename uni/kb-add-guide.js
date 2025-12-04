const fs = require('fs');

// Чете JSON файла
const rawData = fs.readFileSync('kb-template.json', 'utf8');
const data = JSON.parse(rawData);

console.log('🔧 Adding guide data to kb-template.json...');

// Default guide templates за различни типове елементи
const defaultGuidesByType = {
    checkbox: {
        image: 'msm/left-up.png',
        height: 150,
        x: -50,
        y: 10,
        bx: -200,
        by: 80,
        bWidth: 250,
        bHeight: 100,
        stopAfter: true,
        action: 'highlight'
    },
    select: {
        image: 'msm/left-up.png',
        height: 150,
        x: -50,
        y: 10,
        bx: -200,
        by: 80,
        bWidth: 250,
        bHeight: 100,
        stopAfter: true,
        action: 'highlight'
    },
    range: {
        image: 'msm/right-up.png',
        height: 150,
        x: -88,
        y: 1,
        bx: 199,
        by: 166,
        bWidth: 275,
        bHeight: 118,
        stopAfter: true,
        action: 'highlight'
    },
    number: {
        image: 'msm/left-up.png',
        height: 150,
        x: -50,
        y: 10,
        bx: -200,
        by: 80,
        bWidth: 250,
        bHeight: 100,
        stopAfter: true,
        action: 'highlight'
    },
    radio: {
        image: 'msm/left-up.png',
        height: 150,
        x: -50,
        y: 10,
        bx: -200,
        by: 80,
        bWidth: 250,
        bHeight: 100,
        stopAfter: true,
        action: 'highlight'
    }
};

// UI templates
const uiButtonTemplate = {
    image: 'msm/left-up.png',
    height: 200,
    x: 3,
    y: 16,
    bx: -250,
    by: 96,
    bWidth: 215,
    bHeight: 91,
    stopAfter: true,
    action: 'highlight'
};

const uiInputTemplate = {
    image: 'msm/expl.png',
    height: 150,
    x: 25,
    y: 321,
    bx: 80,
    by: -14,
    bWidth: 241,
    bHeight: 124,
    stopAfter: true,
    action: 'highlight'
};

// Добавяме guide данни към settings
let settingsUpdated = 0;
data.settings.forEach(setting => {
    if (!setting.guide) {
        const guideTemplate = defaultGuidesByType[setting.type] || defaultGuidesByType.checkbox;
        setting.guide = {
            ...guideTemplate,
            target: setting.id.includes('-') ? `#${setting.id}` : `input[name="sort-criteria"][value="${setting.id.split('-').pop()}"]`,
            context: setting.category
        };
        settingsUpdated++;
    }
});

// Добавяме guide данни към UI елементи
let uiUpdated = 0;
data.ui.forEach(ui => {
    if (!ui.guide) {
        const guideTemplate = ui.type === 'button' ? uiButtonTemplate : uiInputTemplate;
        ui.guide = {
            ...guideTemplate,
            target: `#${ui.id}`,
            context: 'ui'
        };
        uiUpdated++;
    }
});

// Актуализираме metadata
data.metadata.version = '2.0.0';
data.metadata.description = 'Knowledge Base for CX MultiNotes Viewer Assistant - With Guide Integration';
data.metadata.updated = new Date().toISOString();

// Форматираме JSON компактно (keywords на един ред)
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
        } else if (key === 'guide') {
            output += `      "guide": ${JSON.stringify(value, null, 2).split('\n').map((line, idx) => idx === 0 ? line : '      ' + line).join('\n')}${comma}\n`;
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
        } else if (key === 'guide') {
            output += `      "guide": ${JSON.stringify(value, null, 2).split('\n').map((line, idx) => idx === 0 ? line : '      ' + line).join('\n')}${comma}\n`;
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

console.log('✅ Guide data added successfully!');
console.log(`📊 Statistics:`);
console.log(`   - Settings updated: ${settingsUpdated}/${data.settings.length}`);
console.log(`   - UI elements updated: ${uiUpdated}/${data.ui.length}`);
console.log(`   - Version: ${data.metadata.version}`);
console.log('\n💾 File saved: kb-template.json');
