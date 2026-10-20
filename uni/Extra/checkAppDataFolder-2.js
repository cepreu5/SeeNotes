(async () => {
    console.clear(); // Изчистваме конзолата за по-добра видимост

    const stored = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
    if (!stored) {
        console.error("Липсва токен за достъп.");
        return;
    }
    const token = JSON.parse(stored).access_token;
    console.log("🚀 Стартиране на проверка на AppDataFolder за дубликати...");

    let allFiles = [];
    let nextPageToken = null;

    try {
        do {
            const pageTokenParam = nextPageToken ? `&pageToken=${nextPageToken}` : '';
            const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=nextPageToken,files(id,name,modifiedTime,size)&pageSize=100${pageTokenParam}`;
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (data.files) allFiles = allFiles.concat(data.files);
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        if (allFiles.length === 0) {
            console.log("❌ AppDataFolder е празна.");
            return;
        }

        // 1. Показваме пълния списък
        console.log(`📊 Общо намерени ${allFiles.length} обекта. Пълен списък:`);
        console.table(allFiles.map(f => ({ Име: f.name, ID: f.id, Променен: f.modifiedTime })));

        // 2. Обобщена информация за дубликатите
        const counts = {};
        allFiles.forEach(f => { counts[f.name] = (counts[f.name] || 0) + 1; });

        const summary = Object.keys(counts)
            .filter(name => counts[name] > 1)
            .map(name => ({
                "Име на файл": name,
                "Брой копия": counts[name]
            }));

        if (summary.length > 0) {
            console.warn("⚠️ ВНИМАНИЕ: Открити са следните дубликати:");
            console.table(summary);
        } else {
            console.log("✅ Няма открити дубликати по име.");
        }

        console.log("\n🛠️ Инструкция за изтриване на конкретно ID:");
        console.log(`await fetch('https://www.googleapis.com/drive/v3/files/ID_НА_ФАЙЛА', { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + JSON.parse(sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token')).access_token } })`);

    } catch (err) {
        console.error("❌ Грешка при изпълнение:", err);
    }
})();
