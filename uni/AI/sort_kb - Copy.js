const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'kb-template.txt');

try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Parse using Function constructor to handle relaxed JSON (unquoted keys)
    const data = new Function('return ' + content)();

    if (!data.settings || !Array.isArray(data.settings)) {
        console.error('Error: settings array not found or invalid');
        process.exit(1);
    }

    const priorityCategory = 'data-management';

    // Sort logic
    data.settings.sort((a, b) => {
        const catA = a.category || '';
        const catB = b.category || '';

        // Priority category goes to end
        if (catA === priorityCategory && catB !== priorityCategory) return 1;
        if (catB === priorityCategory && catA !== priorityCategory) return -1;

        // Others sorted alphabetically
        if (catA === catB) return 0;
        return catA.localeCompare(catB);
    });

    // Reconstruct object to maintain section order
    const output = {
        metadata: data.metadata,
        ui_texts: data.ui_texts,
        settings: data.settings
    };

    // Write back with indentation 4
    fs.writeFileSync(filePath, JSON.stringify(output, null, 4));
    console.log('Successfully sorted kb-template.txt');

} catch (err) {
    console.error('Error processing file:', err);
    process.exit(1);
}
