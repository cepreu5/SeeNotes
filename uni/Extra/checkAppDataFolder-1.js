(async () => {
    console.clear(); // Изчистваме конзолата за по-добра видимост
    const stored = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
    if (!stored) {
        console.error("Липсва токен за достъп.");
        return;
    }
    const token = JSON.parse(stored).access_token;
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
        // 1. Намираме всички папки с име AppSettings в AppDataFolder
        const qFolder = encodeURIComponent("name='AppSettings' and mimeType='application/vnd.google-apps.folder' and trashed=false");
        const resFolder = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qFolder}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`, { headers });
        const dataFolder = await resFolder.json();

        if (!dataFolder.files || dataFolder.files.length === 0) {
            console.log("❌ Не е намерена папка 'AppSettings' в AppDataFolder.");
            return;
        }

        console.log(`Намерени ${dataFolder.files.length} папки 'AppSettings':`);
        console.table(dataFolder.files);

        // 2. За всяка намерена папка AppSettings изтриваме съдържанието или само го показваме
        for (const folder of dataFolder.files) {
            console.log(`--- Съдържание на папка ID: ${folder.id} ---`);
            const qFiles = encodeURIComponent(`'${folder.id}' in parents and trashed=false`);
            const resFiles = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qFiles}&spaces=appDataFolder&fields=files(id,name,modifiedTime,size)`, { headers });
            const dataFiles = await resFiles.json();

            if (!dataFiles.files || dataFiles.files.length === 0) {
                console.log("Папката е празна.");
            } else {
                console.table(dataFiles.files.map(f => ({
                    Име: f.name,
                    ID: f.id,
                    Променен: f.modifiedTime,
                    Размер: f.size
                })));
            }
        }

        console.log("\n💡 Ако виждате два файла folders.json в една папка или два пъти папка AppSettings, това е причината за проблема.");

    } catch (err) {
        console.error("Грешка:", err);
    }
})();
