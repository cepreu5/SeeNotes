const fs = require("fs");
const vm = require("vm");

// 1) Четем файла като текст
const input = fs.readFileSync("i18n-bg.txt", "utf8");

// 2) Извличаме само { ... }
const start = input.indexOf("{");
const end = input.lastIndexOf("}");
if (start === -1 || end === -1) {
    console.error("Не е намерен { ... } блок.");
    process.exit(1);
}
const objectCode = input.slice(start, end + 1);

// 3) Създаваме sandbox и изпълняваме JS обекта вътре
const sandbox = {};
vm.createContext(sandbox);

try {
    // Превръщаме го в JS код, който връща обекта
    const script = new vm.Script("result = " + objectCode);
    script.runInContext(sandbox);

    // 4) Превръщаме JS обекта в JSON
    const json = JSON.stringify(sandbox.result, null, 4);

    // 5) Записваме резултата
    fs.writeFileSync("lang/i18n-bg.json", json, "utf8");
    console.log("Готово! Файлът i18n-bg.json е създаден.");

} catch (err) {
    console.error("Грешка при парсване:", err.message);
}
