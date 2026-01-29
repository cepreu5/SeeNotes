// --- Optimization: Preload unique backgrounds to avoid 'checkered' loading and reduce memory ---
async function preloadNoteBackgrounds(notesData) {
    const notesBgrdEnabled = localStorage.getItem('notesBgrd') !== 'false';
    if (!notesBgrdEnabled) return;

    const needed = new Set();
    notesData.forEach(note => {
        if (note.status === 1) return;
        const noteColor = note.color;
        const color = (noteColor !== null && noteColor >= 0 && noteColor <= 9) ? noteColorMap[noteColor] : '#FBFF86';
        const img = (note.sellist && note.sellist > 0) ? note.sellist : 0;
        needed.add(`${color}_${img}`);
    });

    const promises = [];
    needed.forEach(key => {
        if (!noteBgCache.has(key)) {
            const parts = key.split('_'); // key is "color_img"
            const color = parts[0];
            const img = parseInt(parts[1]);
            const p = createColoredNoteBackground(color, img, 250, 250).then(canvas => {
                return new Promise(resolveBlob => {
                    canvas.toBlob(blob => {
                        const url = URL.createObjectURL(blob);
                        noteBgCache.set(key, `url("${url}")`);
                        resolveBlob();
                    }, 'image/png');
                });
            }).catch(e => console.warn("Failed to preload bg:", key, e));
            promises.push(p);
        }
    });
    await Promise.all(promises);
}
