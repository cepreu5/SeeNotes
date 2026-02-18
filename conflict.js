// --- Three-way Merge & Conflict Resolution ---
async function fetchGDriveFileContent(fileId) {
    const tokenObj = (typeof authToken !== 'undefined' && authToken) ? authToken : (gapi.client.getToken() || gapi.auth.getToken());
    let accessToken = tokenObj ? tokenObj.access_token : null;
    if (!accessToken) throw new Error("Missing auth token.");
    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });
        if (!response.ok) {
            if (response.status === 401) {
                const refreshed = await refreshAuthToken();
                if (refreshed && refreshed.pass) {
                    const retry = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                        headers: { 'Authorization': `Bearer ${refreshed.tokenData.access_token}` },
                        cache: 'no-store'
                    });
                    if (retry.ok) return await retry.text();
                }
            }
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    } catch (e) { console.error("Fetch GDrive failed:", e); return null; }
}

function mergeField(base, local, server) {
    if (String(local) === String(server)) return local;
    if (String(local) === String(base)) return server;
    if (String(server) === String(base)) return local;
    return { conflict: true, local, server };
}

function mergeNotes(baseNote, localNote, serverNote) {
    const result = { ...localNote };
    const conflicts = {};
    const splitNote = (txt) => {
        const parts = (txt || "").split('|');
        return { title: parts[0] || "", body: parts[1] || "", hasSplit: parts.length > 1 };
    };
    const b = splitNote(baseNote.notetxt), l = splitNote(localNote.notetxt), s = splitNote(serverNote.notetxt);
    if (l.hasSplit || s.hasSplit || b.hasSplit) {
        const mT = mergeField(b.title, l.title, s.title);
        const mB = mergeField(b.body, l.body, s.body);
        let fT = mT, fB = mB;
        if (mT && mT.conflict) { conflicts.title = mT; fT = "<<CONFLICT>>"; }
        if (mB && mB.conflict) { conflicts.body = mB; fB = "<<CONFLICT>>"; }
        result.notetxt = fT + '|' + fB;
    } else {
        const merged = mergeField(baseNote.notetxt, localNote.notetxt, serverNote.notetxt);
        if (merged && merged.conflict) { conflicts.notetxt = merged; result.notetxt = "<<CONFLICT>>"; }
        else result.notetxt = merged;
    }
    ['color', 'boardid', 'calendarDate', 'text_span', 'title_span', 'pass'].forEach(key => {
        if (String(localNote[key]) !== String(baseNote[key]) && String(serverNote[key]) !== String(baseNote[key])) {
            if (String(localNote[key]) !== String(serverNote[key])) conflicts[key] = { local: localNote[key], server: serverNote[key] };
        } else if (String(serverNote[key]) !== String(baseNote[key])) result[key] = serverNote[key];
    });
    return { result, conflicts };
}

async function showNoteConflictModal(unusedBase, localNote, serverNote, unusedConflicts) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'dual-conflict-overlay';
        Object.assign(overlay.style, { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' });

        const container = document.createElement('div');
        const sW = localStorage.getItem('modalWidth') || '400px';
        const sH = localStorage.getItem('modalHeight') || '300px';
        Object.assign(container.style, { position: 'relative', width: sW, height: sH, maxWidth: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', perspective: '1000px' });

        const renderVersion = (note, zIndex) => {
            const card = document.createElement('div');
            card.className = 'modal-content-box';
            Object.assign(card.style, { position: 'absolute', width: '100%', height: '100%', zIndex: zIndex, transition: 'all 0.4s cubic-bezier(0.19, 1, 0.22, 1)', opacity: zIndex > 50 ? '1' : '0.4', transform: zIndex > 50 ? 'scale(1)' : 'scale(0.85) translateY(20px)', pointerEvents: zIndex > 50 ? 'auto' : 'none', margin: '0', display: 'flex', flexDirection: 'column' });

            // Background logic
            const colorIdx = note.color || 0;
            card.style.backgroundColor = noteColorMap[colorIdx] || '#FBFF86';
            if (localStorage.getItem('imgBgrd') !== 'false') card.style.backgroundImage = "url('Note.jpg')";

            // Header: Date only (standard look)
            const labelEl = document.createElement('div');
            labelEl.id = 'modal-board-name';
            labelEl.style.display = 'block'; labelEl.style.left = '15px'; labelEl.style.top = '10px';
            labelEl.innerHTML = `<span style="font-weight:normal; font-size:11px; opacity:0.6; color:#000;">${new Date(parseInt(note.datemod)).toLocaleString()}</span>`;
            card.appendChild(labelEl);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close modal-header-btn';
            closeBtn.style.right = '10px'; closeBtn.onclick = () => { overlay.remove(); resolve(null); };
            card.appendChild(closeBtn);

            const bdy = document.createElement('div');
            bdy.className = 'modal-body'; bdy.style = 'padding:20px; margin-top:40px; overflow-y:auto; flex-grow:1; position:relative;';
            card.appendChild(bdy);

            // Action Buttons (Bottom Right)
            const createBtn = (id, icon, right, title) => {
                const btn = document.createElement('div');
                btn.innerHTML = icon; btn.title = title;
                Object.assign(btn.style, { position: 'absolute', bottom: '15px', right: right, width: '40px', height: '40px', backgroundColor: 'darkorange', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', cursor: 'pointer', zIndex: 100 });
                card.appendChild(btn); return btn;
            };

            const btnEdit = createBtn('conf-edit', pencilIconSvg, '100px', 'Edit');
            const btnSave = createBtn('conf-save', diskIconSvg, '50px', 'Use this version');
            const btnEye = createBtn('conf-eye', eyeIconSvg, '100px', 'Preview');
            btnSave.style.display = 'flex'; btnEdit.style.display = 'flex'; btnEye.style.display = 'none';

            const refreshContent = (currentNote) => {
                let txt = currentNote.notetxt || '';
                const pipeIdx = txt.indexOf('|');
                if (pipeIdx !== -1) {
                    const tPart = txt.substring(0, pipeIdx); const bPart = txt.substring(pipeIdx + 1);
                    bdy.innerHTML = (typeof formatText === 'function') ? formatText(tPart, currentNote.title_span || '', true) + '<br>' + formatText(bPart, currentNote.text_span || '', true) : tPart + '<br>' + bPart;
                } else { bdy.innerHTML = (typeof formatText === 'function') ? formatText(txt, currentNote.text_span || '', true) : txt; }
                bdy.dataset.id = currentNote.id || '';
                bdy.dataset.gdid = currentNote.gdid || '';
                bdy.dataset.format = currentNote.text_span || ''; bdy.dataset.titleFormat = currentNote.title_span || '';
            };

            btnEdit.onclick = () => {
                const globalModalBody = modalBody;
                const oldId = globalModalBody ? globalModalBody.id : '';
                if (globalModalBody) globalModalBody.id = '';

                bdy.id = 'modal-body';
                modalBody = bdy;
                currentModalContent = note.notetxt;

                enableNoteEditing(bdy);

                btnEdit.style.display = 'none'; btnSave.style.right = '50px'; btnEye.style.display = 'flex';

                modalBody = globalModalBody;
                if (globalModalBody) globalModalBody.id = oldId;
            };

            btnEye.onclick = () => {
                const txtArea = bdy.querySelector('textarea');
                if (txtArea) {
                    const masked = bdy.dataset.maskedLinks ? JSON.parse(bdy.dataset.maskedLinks) : [];
                    const res = postEdit(txtArea.value, parseFormatsString(bdy.dataset.format), masked);
                    note.notetxt = res.text; note.text_span = stringifyFormatsArray(res.formats);
                    const titleArea = bdy.querySelector('#note-edit-title-textarea');
                    if (titleArea) {
                        const tRes = postEdit(titleArea.value, parseFormatsString(bdy.dataset.titleFormat), masked);
                        note.notetxt = tRes.text + '|' + res.text; note.title_span = stringifyFormatsArray(tRes.formats);
                    }
                }
                refreshContent(note);
                btnEdit.style.display = 'flex'; btnEye.style.display = 'none';
            };

            btnSave.onclick = async () => {
                const txtArea = bdy.querySelector('textarea');
                if (txtArea) {
                    const masked = bdy.dataset.maskedLinks ? JSON.parse(bdy.dataset.maskedLinks) : [];
                    const res = postEdit(txtArea.value, parseFormatsString(bdy.dataset.format), masked);
                    note.notetxt = res.text; note.text_span = stringifyFormatsArray(res.formats);
                    const titleArea = bdy.querySelector('#note-edit-title-textarea');
                    if (titleArea) {
                        const tRes = postEdit(titleArea.value, parseFormatsString(bdy.dataset.titleFormat), masked);
                        note.notetxt = tRes.text + '|' + res.text; note.title_span = stringifyFormatsArray(tRes.formats);
                    }
                }
                note.datemod = Date.now(); overlay.remove(); resolve(note);
            };

            refreshContent(note);
            return { card, bdy };
        };

        const local = renderVersion(localNote, 60);
        const server = renderVersion(serverNote, 40);
        container.appendChild(server.card); container.appendChild(local.card);

        // Tab-like buttons
        const tabs = document.createElement('div');
        Object.assign(tabs.style, { position: 'absolute', bottom: '-65px', display: 'flex', gap: '5px', zIndex: 5 });
        const createTab = (txt, active) => {
            const t = document.createElement('button');
            t.textContent = txt;
            t.style = `padding:8px 20px; border:none; border-radius:0 0 10px 10px; cursor:pointer; font-weight:bold; background:${active ? 'darkorange' : '#444'}; color:${active ? '#000' : '#fff'}; transition: 0.3s;`;
            return t;
        };
        const tabL = createTab('ЛОКАЛНА (DB)', true);
        const tabS = createTab('СЪРВЪР (GD)', false);

        const switchView = (isLocal) => {
            local.card.style.zIndex = isLocal ? 60 : 40; local.card.style.opacity = isLocal ? '1' : '0.4'; local.card.style.transform = isLocal ? 'scale(1)' : 'scale(0.85) translateY(20px)'; local.card.style.pointerEvents = isLocal ? 'auto' : 'none';
            server.card.style.zIndex = isLocal ? 40 : 60; server.card.style.opacity = isLocal ? '0.4' : '1'; server.card.style.transform = isLocal ? 'scale(0.85) translateY(20px)' : 'scale(1)'; server.card.style.pointerEvents = isLocal ? 'none' : 'auto';
            tabL.style.background = isLocal ? 'darkorange' : '#444'; tabL.style.color = isLocal ? '#000' : '#fff';
            tabS.style.background = isLocal ? '#444' : 'darkorange'; tabS.style.color = isLocal ? '#fff' : '#000';

            // Safe ID management: only one element should have 'modal-body' at any time
            if (isLocal) {
                server.bdy.id = '';
                local.bdy.id = 'modal-body';
            } else {
                local.bdy.id = '';
                server.bdy.id = 'modal-body';
            }
        };

        tabL.onclick = () => switchView(true);
        tabS.onclick = () => switchView(false);
        tabs.appendChild(tabL); tabs.appendChild(tabS);
        container.appendChild(tabs);
        overlay.appendChild(container);
        document.body.appendChild(overlay);
        switchView(true);
    });
}

async function showNoteConflictModalOld(unusedBase, localNote, serverNote, unusedConflicts) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'dual-conflict-overlay';
        Object.assign(overlay.style, { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' });
        const container = document.createElement('div');
        Object.assign(container.style, { position: 'relative', width: '90%', height: '80%', maxWidth: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', perspective: '1000px' });
        const renderCard = (note, label, zIndex) => {
            const card = document.createElement('div');
            card.className = 'modal-content-box';
            Object.assign(card.style, { position: 'absolute', width: '100%', height: '100%', zIndex: zIndex, transition: 'all 0.4s cubic-bezier(0.19, 1, 0.22, 1)', opacity: zIndex > 50 ? '1' : '0.4', transform: zIndex > 50 ? 'scale(1)' : 'scale(0.85) translateY(20px)', pointerEvents: zIndex > 50 ? 'auto' : 'none', backgroundColor: noteColorMap[note.color || 0] || '#FBFF86', margin: '0', display: 'flex', flexDirection: 'column' });
            const labelEl = document.createElement('div');
            labelEl.id = 'modal-board-name';
            labelEl.style.display = 'block'; labelEl.style.left = '15px'; labelEl.style.top = '10px';
            labelEl.innerHTML = `<span style="color:#000;">${label}</span> <span style="font-weight:normal; font-size:11px; opacity:0.6;">${new Date(parseInt(note.datemod)).toLocaleString()}</span>`;
            card.appendChild(labelEl);
            const editBtn = document.createElement('button');
            editBtn.className = 'modal-header-btn';
            editBtn.innerHTML = pencilIconSvg;
            editBtn.style.right = '90px';
            editBtn.title = _('edit') || 'Редактирай';
            editBtn.onclick = () => { bdy.id = 'modal-body'; currentModalContent = note.notetxt; enableNoteEditing(bdy); editBtn.style.display = 'none'; };
            card.appendChild(editBtn);
            const saveBtn = document.createElement('button');
            saveBtn.className = 'modal-header-btn';
            saveBtn.innerHTML = diskIconSvg;
            saveBtn.style.right = '50px';
            saveBtn.title = _('useThisVersion') || 'Изпълзвай тази версия';
            saveBtn.onclick = async () => {
                const txtArea = bdy.querySelector('textarea');
                const titleArea = bdy.querySelector('#note-edit-title-textarea');
                let resNote = { ...note };
                if (txtArea) {
                    const maskedLinks = bdy.dataset.maskedLinks ? JSON.parse(bdy.dataset.maskedLinks) : [];
                    const resPart = postEdit(txtArea.value, parseFormatsString(bdy.dataset.format), maskedLinks);
                    resNote.notetxt = resPart.text; resNote.text_span = stringifyFormatsArray(resPart.formats);
                    if (titleArea) {
                        const tRes = postEdit(titleArea.value, parseFormatsString(bdy.dataset.titleFormat), maskedLinks);
                        resNote.notetxt = tRes.text + '|' + resPart.text; resNote.title_span = stringifyFormatsArray(tRes.formats);
                    }
                }
                resNote.datemod = Date.now(); overlay.remove(); resolve(resNote);
            };
            card.appendChild(saveBtn);
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close modal-header-btn';
            closeBtn.style.right = '10px';
            closeBtn.onclick = () => { overlay.remove(); resolve(null); };
            card.appendChild(closeBtn);
            const bdy = document.createElement('div');
            bdy.className = 'modal-body'; bdy.style = 'padding:20px; margin-top:50px; overflow-y:auto; flex-grow:1; position:relative;';
            let txt = note.notetxt || '';
            const pipeIdx = txt.indexOf('|');
            if (pipeIdx !== -1) {
                const titlePart = txt.substring(0, pipeIdx); const bodyPart = txt.substring(pipeIdx + 1);
                bdy.innerHTML = (typeof formatText === 'function') ? formatText(titlePart, note.title_span || '', true) + '<br>' + formatText(bodyPart, note.text_span || '', true) : titlePart + '<br>' + bodyPart;
            } else { bdy.innerHTML = (typeof formatText === 'function') ? formatText(txt, note.text_span || '', true) : txt; }
            bdy.dataset.format = note.text_span || ''; bdy.dataset.titleFormat = note.title_span || '';
            card.appendChild(bdy);
            return { card, bdy, editBtn, saveBtn };
        };
        const local = renderCard(localNote, 'LOCAL (DB)', 60);
        const server = renderCard(serverNote, 'SERVER (GD)', 40);
        container.appendChild(server.card); container.appendChild(local.card);
        const footer = document.createElement('div');
        footer.style = 'margin-top:25px; display:flex; gap:15px; z-index:10001;';
        const btnL = document.createElement('button');
        btnL.textContent = 'ЛОКАЛНА (DB)'; btnL.style = 'padding:12px 25px; border-radius:10px; border:none; background:darkorange; cursor:pointer; font-weight:bold;';
        const btnS = document.createElement('button');
        btnS.textContent = 'СЪРВЪР (GD)'; btnS.style = 'padding:12px 25px; border-radius:10px; border:none; background:#444; color:#fff; cursor:pointer; font-weight:bold;';
        const updateView = (shLocal) => {
            local.card.style.zIndex = shLocal ? 60 : 40; local.card.style.opacity = shLocal ? '1' : '0.4'; local.card.style.transform = shLocal ? 'scale(1)' : 'scale(0.85) translateY(20px)'; local.card.style.pointerEvents = shLocal ? 'auto' : 'none';
            server.card.style.zIndex = shLocal ? 40 : 60; server.card.style.opacity = shLocal ? '0.4' : '1'; server.card.style.transform = shLocal ? 'scale(0.85) translateY(20px)' : 'scale(1)'; server.card.style.pointerEvents = shLocal ? 'none' : 'auto';
            if (shLocal) { local.bdy.id = 'modal-body'; server.bdy.id = ''; btnL.style.background = 'darkorange'; btnL.style.color = '#000'; btnS.style.background = '#444'; btnS.style.color = '#fff'; }
            else { server.bdy.id = 'modal-body'; local.bdy.id = ''; btnS.style.background = 'darkorange'; btnS.style.color = '#000'; btnL.style.background = '#444'; btnL.style.color = '#fff'; }
        };
        btnL.onclick = () => updateView(true); btnS.onclick = () => updateView(false);
        footer.appendChild(btnL); footer.appendChild(btnS);
        overlay.appendChild(container); overlay.appendChild(footer);
        document.body.appendChild(overlay); updateView(true);
    });
}
