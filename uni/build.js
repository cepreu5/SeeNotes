const fs = require('fs');
const path = require('path');
const terser = require('terser');

const srcFiles = [
    'src/01_config_state.js',
    'src/02_i18n.js',
    'src/03_indexeddb.js',
    'src/04_gdrive.js',
    'src/05_ui_helpers.js',
    'src/06_ui_render.js',
    'src/07_settings.js',
    'src/08_app_init.js'
];

async function runBuild() {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] 🔄 Building main.js & mainn.js...`);
    
    try {
        let concatenatedCode = '';
        for (const file of srcFiles) {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                concatenatedCode += fs.readFileSync(filePath, 'utf8') + '\n\n';
            } else {
                console.error(`❌ File not found: ${file}`);
                return;
            }
        }

        fs.writeFileSync(path.join(__dirname, 'main.js'), concatenatedCode, 'utf8');

        const minified = await terser.minify(concatenatedCode, {
            compress: {
                arrows: true,
                booleans: true,
                collapse_vars: true,
                comparisons: true,
                dead_code: true,
                drop_console: true,
                hoist_funs: true,
                if_return: true,
                passes: 3,
                pure_funcs: ['console.log']
            },
            mangle: {
                toplevel: true,
                reserved: ['gisLoaded', 'startApp', 'handleAuthClick', 'initLoginPage', '_']
            },
            ecma: 2020,
            format: {
                wrap_iife: true
            }
        });

        if (minified.code) {
            fs.writeFileSync(path.join(__dirname, 'mainn.js'), minified.code, 'utf8');
            console.log(`[${timestamp}] ✅ Build successful! (main.js & mainn.js updated)`);
        } else {
            console.error(`[${timestamp}] ❌ Terser minification returned empty output.`);
        }
    } catch (err) {
        console.error(`[${timestamp}] ❌ Build failed with error:`, err);
    }
}

runBuild();
