async function createSettingsUI(boardsData, boardParseError) {
    const settingsModalBody = document.getElementById('settings-modal-body');
    if (!settingsModalBody.dataset.initializedListeners) {
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const loadSettingsBtn = document.getElementById('load-settings-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.onclick = null;
            saveSettingsBtn.addEventListener('click', () => {
                saveSettingsToGDrive();
            });
        }
        if (loadSettingsBtn) {
            loadSettingsBtn.onclick = null;
            loadSettingsBtn.addEventListener('click', () => {
                loadSettingsFromGDrive();
            });
        }
        const showSettingsBtn = document.getElementById('show-settings-btn');
        if (showSettingsBtn) {
            showSettingsBtn.style.display = (typeof debug !== 'undefined' && debug) ? '' : 'none';
            showSettingsBtn.onclick = null;
            showSettingsBtn.addEventListener('click', () => {
                const content = localStorage.getItem('settings_multinotes_data');
                if (content) {
                    sessionStorage.setItem('full_settings_json', content);
                }
                sessionStorage.setItem('boardMenuOrder', localStorage.getItem('boardMenuOrder') || '[]');
                const boardsToStore = (typeof boardsData !== 'undefined' && boardsData.length > 0) ? boardsData : [];
                sessionStorage.setItem('boardsData', JSON.stringify(boardsToStore));
                const titlesMap = {};
                boardsToStore.forEach(b => {
                    const bid = String(b.gdid || b.id);
                    if (bid && bid !== 'undefined' && b.title) titlesMap[bid] = b.title;
                    if (b.title) titlesMap[b.title] = b.title;
                });
                sessionStorage.setItem('boardTitlesMap', JSON.stringify(titlesMap));
                window.open('set.html', '_blank');
            });
        }
        settingsModalBody.dataset.initializedListeners = 'true';
    }
    // --- Language Select in Settings (populated dynamically on UI creation) ---
    const settingsLangSelect = document.getElementById('settings-lang-select');
    if (settingsLangSelect) {
        settingsLangSelect.innerHTML = '';
        SUPPORTED_LANGUAGES.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.id;
            option.textContent = lang.label;
            if (lang.id === currentLang) option.selected = true;
            settingsLangSelect.appendChild(option);
        });
        if (!settingsLangSelect.dataset.hasChangeListener) {
            settingsLangSelect.dataset.hasChangeListener = 'true';
            settingsLangSelect.addEventListener('change', () => {
                const newLang = settingsLangSelect.value;
                localStorage.setItem('language', newLang);
                window.location.reload();
            });
        }
    }
    const settingsLangLabel = document.querySelector('#settings-lang-wrapper label');
    if (settingsLangLabel && typeof _ === 'function') {
        settingsLangLabel.textContent = _('languageLabel') || 'Език:';
    }

    // --- Get Element References ---
    const scaleSlider = document.getElementById('scaleSlider');
    const scaleInput = document.getElementById('scaleInput');
    const noteFontSizeInput = document.getElementById('note-font-size-input');
    const modalFontSizeInput = document.getElementById('modal-font-size-input');
    const showDatemodCheckbox = document.getElementById('show-datemod-checkbox');
    const showFirstLineCheckbox = document.getElementById('show-first-line-checkbox');
    const showNewBoardCheckbox = document.getElementById('show-new-board-checkbox');
    const oneTapLinkCheckbox = document.getElementById('one-tap-link-checkbox');
    const showBoardNoteCountCheckbox = document.getElementById('show-board-note-count-checkbox');
    const showBoardAllCheckbox = document.getElementById('all-board-checkbox');
    const weeklyCalendarCheckbox = document.getElementById('weekly-calendar-checkbox');
    const showBoardRemindCheckbox = document.getElementById('remind-board-checkbox');
    const showPhotosBoardCheckbox = document.getElementById('show-photos-board-checkbox');
    const showVideosBoardCheckbox = document.getElementById('show-videos-board-checkbox');
    const showSoundsBoardCheckbox = document.getElementById('show-sounds-board-checkbox');
    const showOtherBoardCheckbox = document.getElementById('show-other-board-checkbox');
    // const startBoardSelect = document.getElementById('start-board-select');
    const maxSearchesInput = document.getElementById('max-searches-input');
    const useGoogleDbCheckbox = document.getElementById('use-google-db-checkbox');
    const useLocalDbCheckbox = document.getElementById('use-local-db-checkbox');
    const useArhDbCheckbox = document.getElementById('use-arh-db-checkbox');
    const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
    const updateFromSourceCheckbox = document.getElementById('update-from-source-checkbox');
    const dbSectionWrapper = document.getElementById('db-section-wrapper');
    const updateFromSourceWrapper = document.getElementById('update-from-source-wrapper');
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const folderNameDisplay = document.getElementById('local-sync-folder-name');
    const clickToEditCheckbox = document.getElementById('click-to-edit-checkbox');
    const hideAssistantCheckbox = document.getElementById('hide-assistant-checkbox'); // New checkbox
    const hideToastCheckbox = document.getElementById('hide-toast-checkbox');
    const activeFolderSelect = document.getElementById('active-folder-select');
    const deviceNameSelect = document.getElementById('device-name-select');
    const addDeviceBtn = document.getElementById('add-device-btn');
    const deleteDeviceBtn = document.getElementById('delete-device-btn');
    async function loadDeviceProfiles(forceRefresh = false) {
        if (!deviceNameSelect) return;
        let devices = ['Default'];
        let cachedProfiles = localStorage.getItem('deviceProfilesList');

        if (cachedProfiles && !forceRefresh) {
            try {
                devices = JSON.parse(cachedProfiles);
            } catch (e) { }
        } else {
            let content = null;
            if (!isOffline) {
                try {
                    const folderId = await getAppSettingsFolderId();
                    if (folderId) {
                        const existingFiles = await findGDFileByName(folderId, 'settings.json');
                        if (existingFiles && existingFiles.length > 0) content = await fetchGDriveFileContent(existingFiles[0].id);
                    }
                } catch (err) { console.error("Error loading profiles:", err); }
            }
            if (!content) content = localStorage.getItem('settings_multinotes_data');

            if (content) {
                try {
                    const parsed = JSON.parse(content);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        const topLevelKeys = Object.keys(parsed);
                        const isNewFormat = !topLevelKeys.some(k => appSettingsKeys.includes(k) || k.startsWith('board_'));
                        if (isNewFormat) devices = topLevelKeys;
                    }
                } catch (e) { }
            }
            localStorage.setItem('deviceProfilesList', JSON.stringify(devices));
        }

        const currentDevice = localStorage.getItem('deviceName') || 'Default';
        if (!devices.includes(currentDevice)) {
            devices.push(currentDevice);
            localStorage.setItem('deviceProfilesList', JSON.stringify(devices));
        }

        deviceNameSelect.innerHTML = '';
        devices.sort((a, b) => {
            if (a === 'Default') return -1;
            if (b === 'Default') return 1;
            return a.localeCompare(b);
        }).forEach(dev => {
            const opt = document.createElement('option');
            opt.value = dev;
            opt.textContent = dev;
            if (dev === currentDevice) opt.selected = true;
            deviceNameSelect.appendChild(opt);
        });
    }
    if (deviceNameSelect) {
        loadDeviceProfiles();
        deviceNameSelect.addEventListener('change', async () => {
            localStorage.setItem('deviceName', deviceNameSelect.value);
            showToast(_('settingSaved'), 2000);
            // Тихо зареждаме настройките за новия профил
            await loadSettingsFromGDrive(true);
        });
    }
    if (addDeviceBtn) {
        addDeviceBtn.addEventListener('click', () => {
            const newName = prompt("Въведете име за новото устройство / профил:");
            if (newName && newName.trim()) {
                localStorage.setItem('deviceName', newName.trim());
                loadDeviceProfiles();
                showToast(_('settingSaved'), 2000);
            }
        });
    }
    if (deleteDeviceBtn) {
        deleteDeviceBtn.addEventListener('click', async () => {
            const currentDevice = deviceNameSelect.value;
            if (currentDevice === 'Default') {
                showToast("Не може да изтриете профила Default.");
                return;
            }
            if (!await showConfirmation(`Сигурни ли сте, че искате да изтриете профила '${currentDevice}' от облака?`)) return;
            showToast("Изтриване на профила...");
            try {
                const folderId = await getAppSettingsFolderId();
                if (folderId) {
                    const existingFiles = await findGDFileByName(folderId, 'settings.json');
                    if (existingFiles && existingFiles.length > 0) {
                        const content = await fetchGDriveFileContent(existingFiles[0].id);
                        const parsed = JSON.parse(content);
                        if (parsed && parsed[currentDevice]) {
                            delete parsed[currentDevice];
                            await updateGDriveFile(existingFiles[0].id, JSON.stringify(parsed, null, 2));
                            localStorage.setItem('deviceName', 'Default');

                            // Актуализираме кеша веднага щом изтрием файл
                            const newDevicesList = Object.keys(parsed);
                            if (!newDevicesList.includes('Default')) newDevicesList.push('Default');
                            localStorage.setItem('deviceProfilesList', JSON.stringify(newDevicesList));

                            await loadDeviceProfiles();
                            showToast("Профилът е изтрит.");
                        }
                    }
                }
            } catch (err) {
                console.error("Delete profile error:", err);
                showToast("Грешка при изтриване.");
            }
        });
    }
    if (!settingsModalBody.dataset.initialized) {
        // Active Folder Logic
        // Active Folder Logic
        if (activeFolderSelect) {
            populateFoldersDropdown();

            // Попълването на dropdown-а се прави при Ctrl+click/long press (Разширени настройки)

            activeFolderSelect.addEventListener('change', async () => {
                const selectedValue = activeFolderSelect.value;
                let targetFolderName = null;
                let targetFolderId = null;
                const folderNamesStr = localStorage.getItem('gdrive_folder_names');
                const folderNames = folderNamesStr ? JSON.parse(folderNamesStr) : ['multinotes_data'];

                if (selectedValue === 'new_folder' || selectedValue === 'select_folder') {
                    const isNew = selectedValue === 'new_folder';
                    const promptMsg = isNew ? _('newFolderPrompt') : (_('selectFolderPrompt') || 'Въведете име на съществуваща папка:');

                    // Използваме нашия нов асинхронен prompt
                    const folderNameInput = await showPrompt(promptMsg);

                    if (folderNameInput && folderNameInput.trim()) {
                        targetFolderName = folderNameInput.trim();
                        try {
                            if (isNew) {
                                if (typeof showToast === 'function') showToast(_('creatingFolder'));
                                targetFolderId = await createNewGDriveFolder(targetFolderName);
                            } else {
                                targetFolderId = await getFolderIDByName(targetFolderName);
                                if (!targetFolderId) {
                                    if (typeof showToast === 'function') showToast(_('errorFolderNotFoundDrive') || 'Папката не е намерена.');
                                    activeFolderSelect.value = activeFolderName;
                                    return;
                                }
                            }
                        } catch (e) {
                            if (typeof showToast === 'function') showToast(isNew ? _('errorCreateFolder') : (_('errorFolderNotFoundDrive') || 'Папката не е намерена.'));
                            activeFolderSelect.value = activeFolderName;
                            return;
                        }
                    } else {
                        activeFolderSelect.value = activeFolderName;
                        return;
                    }
                } else {
                    targetFolderName = selectedValue;
                }

                if (targetFolderName === activeFolderName) return;

                try {
                    if (!targetFolderId) {
                        targetFolderId = await getFolderIDByName(targetFolderName);
                    }

                    if (targetFolderId) {
                        const oldActiveFolderName = activeFolderName;
                        console.log(`[Folder-Switch] Changing folder to: "${targetFolderName}" (ID: ${targetFolderId})`);
                        const isEmpty = await isGDriveFolderEmpty(targetFolderId);
                        if (isEmpty) {
                            // Използваме нашето асинхронно потвърждение
                            const confirmed = await showConfirmation(_('confirmMigration'));
                            if (confirmed) {
                                await migrateDataToNewFolder(targetFolderId);

                                // Копираме метаданните в новата папка в локалната памет
                                const currentBmo = localStorage.getItem('boardMenuOrder');
                                if (currentBmo) localStorage.setItem('boardMenuOrder_' + targetFolderName, currentBmo);
                                localStorage.setItem('lastNoteId_' + targetFolderName, noteId.toString());
                                localStorage.setItem('lastNoteNumord_' + targetFolderName, noteNumord.toString());
                                const currentBic = localStorage.getItem('boardIdCounter');
                                if (currentBic) localStorage.setItem('lastBoardId_' + targetFolderName, currentBic);
                            }
                        }

                        // Запазваме per-folder данните на папката, от която излизаме
                        if (oldActiveFolderName) {
                            const currentBmo = localStorage.getItem('boardMenuOrder');
                            if (currentBmo) localStorage.setItem('boardMenuOrder_' + oldActiveFolderName, currentBmo);
                            localStorage.setItem('lastNoteId_' + oldActiveFolderName, noteId.toString());
                            localStorage.setItem('lastNoteNumord_' + oldActiveFolderName, noteNumord.toString());
                            const currentBic = localStorage.getItem('boardIdCounter');
                            if (currentBic) localStorage.setItem('lastBoardId_' + oldActiveFolderName, currentBic);
                        }

                        activeFolderName = targetFolderName;
                        localStorage.setItem('active_folder_name', targetFolderName);
                        const loaderFolderInfo = document.getElementById('loader-folder-info');
                        if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
                        localStorage.setItem('gdrive_multinotes_data_id', targetFolderId);
                        // Apply per-folder start board if available
                        const folderStartBoard = localStorage.getItem('startBoard_' + targetFolderName);
                        if (folderStartBoard) {
                            localStorage.setItem('startBoard', folderStartBoard);
                        } else {
                            localStorage.removeItem('startBoard'); // Clear it so it doesn't carry over from the previous folder
                        }
                        // Refresh folders.json before restoring per-folder data
                        if (!isOffline) await loadGlobalFoldersJson();
                        // Възстановяваме per-folder данните на новата папка
                        const newBmo = localStorage.getItem('boardMenuOrder_' + targetFolderName);
                        if (newBmo) {
                            localStorage.setItem('boardMenuOrder', newBmo);
                        } else {
                            localStorage.removeItem('boardMenuOrder');
                        }
                        const newNid = localStorage.getItem('lastNoteId_' + targetFolderName);
                        const newNord = localStorage.getItem('lastNoteNumord_' + targetFolderName);
                        if (newNid !== null) noteId = parseInt(newNid, 10);
                        else noteId = (targetFolderName === 'multinotes_data') ? 1000000 : 0;
                        if (newNord !== null) noteNumord = parseInt(newNord, 10);
                        else noteNumord = (targetFolderName === 'multinotes_data') ? 1000000 : 0;
                        const newBid = localStorage.getItem('lastBoardId_' + targetFolderName);
                        if (newBid !== null) {
                            boardIdCounter = parseInt(newBid, 10);
                            localStorage.setItem('boardIdCounter', boardIdCounter.toString());
                        } else {
                            boardIdCounter = (targetFolderName === 'multinotes_data') ? 1000000 : 0;
                            localStorage.setItem('boardIdCounter', boardIdCounter.toString());
                        }

                        if (!folderNames.includes(targetFolderName)) {
                            folderNames.push(targetFolderName);
                            localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));
                        }

                        // Force Google Drive mode when folder is switched
                        localStorage.setItem('useGoogleDb', 'true');
                        localStorage.setItem('useIndexedDb', 'false');
                        localStorage.setItem('useLocalDb', 'false');
                        localStorage.setItem('useArhDb', 'false');

                        // Clear cached subfolder IDs
                        ["Other", "Sound", "Video", "Images"].forEach(n => localStorage.removeItem(`gdrive_folder_id_${n}`));

                        // Изчистване на локалната база от старата папка (по желание)
                        const confirmDbDel = await showConfirmation((typeof _ === 'function') ? _('confirmDbDeleteOnFolderChange') : 'Желаете ли да изтриете текущата база данни при смяната на папката?');
                        if (confirmDbDel) {
                            if (typeof NOTES_DB_NAME !== 'undefined') {
                                indexedDB.deleteDatabase(NOTES_DB_NAME);
                            } else {
                                indexedDB.deleteDatabase('multinotes_db');
                            }
                        }

                        if (typeof showToast === 'function') showToast(_('settingSaved') + ' Синхронизиране...');
                        syncGlobalFoldersJson();
                        setTimeout(() => location.reload(), 1500);
                    } else {
                        throw new Error("Folder ID not found");
                    }
                } catch (err) {
                    console.error("Error switching folder:", err);
                    showToast(_('errorLoadSettings'));
                    activeFolderSelect.value = activeFolderName;
                }
            });
        }
    }
    // Hide Assistant Logic
    if (hideAssistantCheckbox) {
        hideAssistantCheckbox.checked = localStorage.getItem('hideAssistant') === 'true';
        hideAssistantCheckbox.addEventListener('change', () => {
            const isChecked = hideAssistantCheckbox.checked;
            localStorage.setItem('hideAssistant', isChecked);
            const fabButton = document.getElementById('kb-fab');
            if (fabButton) {
                fabButton.style.display = isChecked ? 'none' : 'block';
            }
            // Ако скрием асистента, скриваме и промо бележката веднага
            if (isChecked) {
                if (promoNoteElement) {
                    promoNoteElement.style.display = 'none';
                }
                // Изчистваме флаговете за затворени промо бележки, за да се покажат отново при включване
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('dismissedPromo_')) {
                        localStorage.removeItem(key);
                    }
                });
            }
            showToast(_('settingSaved'), 2000);
        });
    }
    const trashSearchCheckbox = document.getElementById('trash-search-checkbox');
    if (trashSearchCheckbox) {
        trashSearchCheckbox.checked = localStorage.getItem('trashSearch') === 'true';
        trashSearchCheckbox.addEventListener('change', () => {
            localStorage.setItem('trashSearch', trashSearchCheckbox.checked);
            showToast(_('settingSaved'), 2000);
            applyFilters();
        });
    }
    // Zooom
    const updateZoom = (value) => {
        value = Math.max(25, Math.min(175, parseInt(value, 10)));
        if (isNaN(value)) value = 100;
        notesContainer.style.zoom = value / 100;
        scaleSlider.value = value;
        scaleInput.value = value;
    };
    let savedZoom = localStorage.getItem('zoomLevel');
    if (savedZoom) {
        scaleSlider.value = savedZoom;
        updateZoom(savedZoom);
    } else {
        updateZoom(scaleSlider.value);
    }
    let opacityTimeout;
    const settingsModal = document.getElementById('settings-modal');
    const startOpacityChange = () => {
        if (settingsModal) settingsModal.style.opacity = '0.7';
    };
    const endOpacityChange = () => {
        if (settingsModal) settingsModal.style.opacity = '1';
    };
    const scaleDecBtn = document.getElementById('scaleDecBtn');
    const scaleIncBtn = document.getElementById('scaleIncBtn');
    const stepBtnOpacity = () => {
        startOpacityChange();
        if (opacityTimeout) clearTimeout(opacityTimeout);
        opacityTimeout = setTimeout(endOpacityChange, 1500);
    };
    if (scaleDecBtn) {
        scaleDecBtn.addEventListener('click', () => {
            let val = parseInt(scaleInput.value, 10) || 100;
            val = Math.max(25, val - 1);
            updateZoom(val);
            localStorage.setItem('zoomLevel', val);
            stepBtnOpacity();
        });
    }
    if (scaleIncBtn) {
        scaleIncBtn.addEventListener('click', () => {
            let val = parseInt(scaleInput.value, 10) || 100;
            val = Math.min(175, val + 1);
            updateZoom(val);
            localStorage.setItem('zoomLevel', val);
            stepBtnOpacity();
        });
    }
    const applyBtn = document.getElementById('applyZoomBtn');
    // Listeners for migrated settings
    const closeAfterSaveCheckbox = document.getElementById('close-after-save-checkbox');
    if (closeAfterSaveCheckbox) {
        closeAfterSaveCheckbox.checked = localStorage.getItem('closeAfterSave') === 'true';
        closeAfterSaveCheckbox.addEventListener('change', () => {
            localStorage.setItem('closeAfterSave', closeAfterSaveCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
    }
    const updateLocalFolderCheckbox = document.getElementById('update-local-folder-checkbox');
    if (updateLocalFolderCheckbox) {
        updateLocalFolderCheckbox.checked = localStorage.getItem('updateLocalFolder') === 'true';
        updateLocalFolderCheckbox.addEventListener('change', () => {
            localStorage.setItem('updateLocalFolder', updateLocalFolderCheckbox.checked);
            updateLocalFolder = updateLocalFolderCheckbox.checked;
            showToast(_('settingSaved'), 2000);
        });
    }
    const forceGDriveReadCheckbox = document.getElementById('force-gdrive-read-checkbox');
    if (forceGDriveReadCheckbox) {
        forceGDriveReadCheckbox.checked = localStorage.getItem('forceGDriveRead') === 'true';
        forceGDriveReadCheckbox.addEventListener('change', () => {
            localStorage.setItem('forceGDriveRead', forceGDriveReadCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
    }
    const checkEmptyBoardsCheckbox = document.getElementById('check-empty-boards-checkbox');
    if (checkEmptyBoardsCheckbox) {
        checkEmptyBoardsCheckbox.checked = localStorage.getItem('checkEmptyBoards') === 'true';
        checkEmptyBoardsCheckbox.addEventListener('change', () => {
            localStorage.setItem('checkEmptyBoards', checkEmptyBoardsCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
    }
    const automatedTimerCheckbox = document.getElementById('automated-timer-checkbox');
    if (automatedTimerCheckbox) {
        automatedTimerCheckbox.checked = localStorage.getItem('automatedTimer') !== 'false';
        automatedTimerCheckbox.addEventListener('change', () => {
            localStorage.setItem('automatedTimer', automatedTimerCheckbox.checked);
            automatedTimer = automatedTimerCheckbox.checked;
            showToast(_('settingSaved'), 2000);
        });
    }
    // --- Markdown Symbols Settings ---
    const mdBoldInput = document.getElementById('md-bold-input');
    const mdItalicInput = document.getElementById('md-italic-input');
    const mdStrikeInput = document.getElementById('md-strike-input');
    const mdUnderlineInput = document.getElementById('md-underline-input');
    const mdClearInput = document.getElementById('md-clear-input');
    const mdBulletInput = document.getElementById('md-bullet-input');

    const setupMdInput = (input, storageKey, defaultValue) => {
        if (input) {
            input.value = localStorage.getItem(storageKey) || defaultValue;
            input.addEventListener('change', () => {
                localStorage.setItem(storageKey, input.value);
                showToast(_('settingSaved'), 2000);
            });
        }
    };

    setupMdInput(mdBoldInput, 'mdBold', '**');
    setupMdInput(mdItalicInput, 'mdItalic', '*');
    setupMdInput(mdStrikeInput, 'mdStrike', '~~');
    setupMdInput(mdUnderlineInput, 'mdUnderline', '_');
    setupMdInput(mdClearInput, 'mdClear', '--');
    setupMdInput(mdBulletInput, 'mdBullet', '-');

    applyBtn.addEventListener('click', () => {
        const zoomValue = scaleInput.value;
        updateZoom(zoomValue);
        localStorage.setItem('zoomLevel', zoomValue);
        showToast(_('settingSaved'), 2000);
        // Keep transparency for 5 seconds
        if (typeof startOpacityChange === 'function') {
            startOpacityChange();
            if (opacityTimeout) clearTimeout(opacityTimeout);
            opacityTimeout = setTimeout(() => {
                endOpacityChange();
            }, 5000);
        }
    });
    const syncDirtyBtn = document.getElementById('sync-dirty-btn');
    if (syncDirtyBtn) {
        syncDirtyBtn.addEventListener('click', () => {
            syncDirtyNotes();
        });
    }
    const saveDbFolderBtn = document.getElementById('save-db-folder-btn');
    if (saveDbFolderBtn) {
        saveDbFolderBtn.addEventListener('click', () => {
            handleSaveDbToFolder();
        });
    }
    scaleInput.addEventListener('change', () => {
        const zoomValue = scaleInput.value;
        updateZoom(zoomValue);
        localStorage.setItem('zoomLevel', zoomValue);
    });
    scaleSlider.addEventListener('input', () => {
        const zoomValue = scaleSlider.value;
        updateZoom(zoomValue);
        localStorage.setItem('zoomLevel', zoomValue);
    });
    // --- Прозрачност при използване на плъзгача ---
    scaleSlider.addEventListener('mousedown', startOpacityChange);
    scaleSlider.addEventListener('touchstart', startOpacityChange, { passive: true });
    scaleSlider.addEventListener('mouseup', endOpacityChange);
    scaleSlider.addEventListener('touchend', endOpacityChange);
    scaleSlider.addEventListener('mouseleave', endOpacityChange); // За всеки случай
    scaleSlider.addEventListener('click', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            let currentValue = parseInt(scaleSlider.value, 10);
            let newValue;
            if (currentValue % 10 === 0) {
                newValue = currentValue + 10;
            } else {
                newValue = Math.round(currentValue / 10) * 10;
            }
            const max = parseInt(scaleSlider.max, 10);
            const min = parseInt(scaleSlider.min, 10);
            if (newValue > max) newValue = max;
            if (newValue < min) newValue = min;
            scaleSlider.value = newValue;
            updateZoom(newValue);
            localStorage.setItem('zoomLevel', newValue);
        }
    });
    // Make modal transparent when typing in scaleInput
    scaleInput.addEventListener('focus', () => {
        startOpacityChange();
        if (opacityTimeout) clearTimeout(opacityTimeout);
    });
    scaleInput.addEventListener('blur', endOpacityChange);
    // Fonts
    const setupFontSizeInput = (selectElement, storageKey, defaultValue, targetUpdate) => {
        const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
        fontSizes.forEach(size => {
            const option = document.createElement('option');
            option.value = size;
            option.textContent = `${size}px`;
            selectElement.appendChild(option);
        });
        selectElement.value = localStorage.getItem(storageKey) || defaultValue;
        // Apply initial value
        targetUpdate(selectElement.value);
        selectElement.addEventListener('change', () => {
            const value = selectElement.value;
            localStorage.setItem(storageKey, value);
            targetUpdate(value);
            showToast(_('settingSaved'), 2000);
        });
    };
    setupFontSizeInput(noteFontSizeInput, 'noteFontSize', 16, (val) => document.documentElement.style.setProperty('--note-font-size', `${val}px`));
    setupFontSizeInput(modalFontSizeInput, 'modalFontSize', 16, (val) => modalBody.style.fontSize = `${val}px`);
    // Date
    showDatemodCheckbox.checked = localStorage.getItem('showDatemod') !== 'false'; // Default to true
    showDatemodCheckbox.addEventListener('change', () => {
        const isChecked = showDatemodCheckbox.checked;
        localStorage.setItem('showDatemod', isChecked);
        document.body.classList.toggle('hide-datemod', !isChecked);
        showToast(_('settingSaved'), 2000);
    });
    if (showFirstLineCheckbox) {
        showFirstLineCheckbox.checked = localStorage.getItem('showFirstLine') === 'true'; // Default to false
        showFirstLineCheckbox.addEventListener('change', async () => {
            localStorage.setItem('showFirstLine', showFirstLineCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            await renderUI({ boardParseError: false });
        });
    }
    // Show 'New' Board Checkbox
    if (showNewBoardCheckbox) {
        showNewBoardCheckbox.checked = localStorage.getItem('showNewBoard') === 'true'; // Default to false
        showNewBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showNewBoard', showNewBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
        });
    }
    // One-tap links
    oneTapLinkCheckbox.checked = localStorage.getItem('oneTapLink') === 'true'; // Default to false
    oneTapLinkCheckbox.addEventListener('change', () => {
        const isChecked = oneTapLinkCheckbox.checked;
        localStorage.setItem('oneTapLink', isChecked);
        showToast(_('settingSaved'), 2000);
        oneTapLinkChanged = true;
    });
    // Click to edit
    if (clickToEditCheckbox) {
        clickToEditCheckbox.checked = localStorage.getItem('clickToEdit') !== 'false'; // Default to true
        clickToEditCheckbox.addEventListener('change', () => {
            localStorage.setItem('clickToEdit', clickToEditCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
    }
    // Hide Toast info messages
    isToastHidden = localStorage.getItem('hideToast') === 'true'; // Default to false
    if (hideToastCheckbox) {
        hideToastCheckbox.checked = isToastHidden;
        hideToastCheckbox.addEventListener('change', () => {
            isToastHidden = hideToastCheckbox.checked;
            localStorage.setItem('hideToast', isToastHidden.toString());
            if (!isToastHidden) {
                showToast(_('settingSaved'), 2000);
            }
        });
    }
    // Graphical background
    const imgBgrdCheckbox = document.getElementById('img-bgrd-checkbox');
    imgBgrdCheckbox.checked = localStorage.getItem('imgBgrd') !== 'false'; // Default to true
    imgBgrdCheckbox.addEventListener('change', () => {
        const isChecked = imgBgrdCheckbox.checked;
        localStorage.setItem('imgBgrd', isChecked);
        showToast(_('settingSaved'), 2000);
    });
    // Graphical background (notes list)
    const notesBgrdCheckbox = document.getElementById('notes-bgrd-checkbox');
    notesBgrdCheckbox.checked = localStorage.getItem('notesBgrd') !== 'false'; // Default to true
    notesBgrdCheckbox.addEventListener('change', () => {
        const isChecked = notesBgrdCheckbox.checked;
        localStorage.setItem('notesBgrd', isChecked);
        showToast(_('settingSaved'), 2000);
        notesBgrdChanged = true;
    });
    // Board Note Count
    if (showBoardNoteCountCheckbox) {
        showBoardNoteCountCheckbox.checked = localStorage.getItem('showBoardNoteCount') === 'true';
        showBoardNoteCountCheckbox.addEventListener('change', async () => {
            localStorage.setItem('showBoardNoteCount', showBoardNoteCountCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            // Просто презареждаме менюто. renderUI ще се погрижи за показването/скриването.
            await renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'All' Board Checkbox
    if (showBoardAllCheckbox) {
        showBoardAllCheckbox.checked = localStorage.getItem('showBoardAll') !== 'false'; // Default to true
        showBoardAllCheckbox.addEventListener('change', () => {
            localStorage.setItem('showBoardAll', showBoardAllCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Reminders' Board Checkbox
    if (showBoardRemindCheckbox) {
        showBoardRemindCheckbox.checked = localStorage.getItem('showBoardRemind') !== 'false'; // Default to true
        showBoardRemindCheckbox.addEventListener('change', () => {
            localStorage.setItem('showBoardRemind', showBoardRemindCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Photos' Board Checkbox
    if (showPhotosBoardCheckbox) {
        showPhotosBoardCheckbox.checked = localStorage.getItem('showPhotosBoard') === 'true';
        showPhotosBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showPhotosBoard', showPhotosBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Videos' Board Checkbox
    if (showVideosBoardCheckbox) {
        showVideosBoardCheckbox.checked = localStorage.getItem('showVideosBoard') === 'true';
        showVideosBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showVideosBoard', showVideosBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Sounds' Board Checkbox
    if (showSoundsBoardCheckbox) {
        showSoundsBoardCheckbox.checked = localStorage.getItem('showSoundsBoard') === 'true';
        showSoundsBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showSoundsBoard', showSoundsBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Other' Board Checkbox
    if (showOtherBoardCheckbox) {
        showOtherBoardCheckbox.checked = localStorage.getItem('showOtherBoard') === 'true';
        showOtherBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showOtherBoard', showOtherBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Weekly Calendar Checkbox
    if (weeklyCalendarCheckbox) {
        weeklyCalendarCheckbox.checked = localStorage.getItem('showWeeklyCalendar') === 'true';
        weeklyCalendarCheckbox.addEventListener('change', () => {
            localStorage.setItem('showWeeklyCalendar', weeklyCalendarCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            // No need to rerender, it's checked on calendar view open
        });
    }
    // Sorting and Boards accordions
    const sortingOptionsSection = document.getElementById('sorting-options-section');
    const sortingArrow = document.getElementById('sorting-arrow');
    const boardsOptionsSection = document.getElementById('boards-options-section');
    const boardsArrow = document.getElementById('boards-arrow');
    // Event listener for the sorting arrow
    sortingArrow.addEventListener('click', () => {
        const isActive = sortingOptionsSection.style.display === 'block';
        sortingOptionsSection.style.display = isActive ? 'none' : 'block';
        sortingArrow.style.transition = 'transform 0.3s ease';
        sortingArrow.style.transform = isActive ? 'rotate(0deg)' : 'rotate(180deg)';
    });
    // Event listener for the boards arrow
    boardsArrow.addEventListener('click', () => {
        const isActive = boardsOptionsSection.style.display === 'block';
        boardsOptionsSection.style.display = isActive ? 'none' : 'block';
        boardsArrow.style.transition = 'transform 0.3s ease';
        boardsArrow.style.transform = isActive ? 'rotate(0deg)' : 'rotate(180deg)';
    });
    // Sorting options
    const sortCriteriaRadios = document.querySelectorAll('input[name="sort-criteria"]');
    const savedSortCriteria = localStorage.getItem('sortCriteria') || 'numord';
    sortCriteriaRadios.forEach(radio => {
        if (radio.value === savedSortCriteria) {
            radio.checked = true;
        }
        radio.addEventListener('change', () => {
            if (radio.checked) {
                // Всеки избор на критерий автоматично активира сортирането
                localStorage.setItem('enableNoteSorting', 'true');
                localStorage.setItem('sortCriteria', radio.value);
                applyFilters();
                showToast(_('settingSaved'), 2000);
            }
        });
    });
    const sortReverseCheckbox = document.getElementById('sort-reverse-checkbox');
    sortReverseCheckbox.checked = localStorage.getItem('sortInReverse') === 'true';
    sortReverseCheckbox.addEventListener('change', () => {
        localStorage.setItem('enableNoteSorting', 'true');
        localStorage.setItem('sortInReverse', sortReverseCheckbox.checked);
        applyFilters();
        showToast(_('settingSaved'), 2000);
    });
    const sortRemindersTopCheckbox = document.getElementById('sort-reminders-top-checkbox');
    sortRemindersTopCheckbox.checked = localStorage.getItem('sortRemindersTop') === 'true';
    sortRemindersTopCheckbox.addEventListener('change', () => {
        localStorage.setItem('enableNoteSorting', 'true');
        localStorage.setItem('sortRemindersTop', sortRemindersTopCheckbox.checked);
        applyFilters();
        showToast(_('settingSaved'), 2000);
    });
    const systemBoardSortSelect = document.getElementById('system-board-sort-select');
    const systemBoardOrderBtn = document.getElementById('system-board-order-btn');
    if (systemBoardSortSelect) {
        const systemSortBoards = [
            { id: 'all', label: _('allBoards') },
            { id: 'reminder', label: _('reminder') },
            { id: 'new-updates', label: _('newUpdates') },
            { id: 'with-photos', label: _('showPhotosBoardLabel').replace(/<[^>]*>/g, '').replace(/^(Board|Борд)\s*/i, '').replace(/:$/, '') },
            { id: 'with-videos', label: _('showVideosBoardLabel').replace(/<[^>]*>/g, '').replace(/^(Board|Борд)\s*/i, '').replace(/:$/, '') },
            { id: 'with-sounds', label: _('showSoundsBoardLabel').replace(/<[^>]*>/g, '').replace(/^(Board|Борд)\s*/i, '').replace(/:$/, '') },
            { id: 'with-other', label: _('showOtherBoardLabel').replace(/<[^>]*>/g, '').replace(/^(Board|Борд)\s*/i, '').replace(/:$/, '') },
            { id: 'search-results', label: _('searchResultTitle') },
            { id: 'trash', label: _('trashBoardTitle') }
        ];
        systemBoardSortSelect.innerHTML = '';
        systemSortBoards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = board.label || board.id;
            systemBoardSortSelect.appendChild(option);
        });
    }
    if (systemBoardOrderBtn && systemBoardSortSelect) {
        systemBoardOrderBtn.addEventListener('click', () => {
            const boardOrderModal = document.getElementById('board-order-modal');
            if (!boardOrderModal) return;
            ensureBoardSortOptionsCloned();
            const boardId = systemBoardSortSelect.value || 'all';
            boardOrderModal.dataset.mode = 'system';
            boardOrderModal.dataset.systemBoardId = boardId;
            applySortStatusToControls(getSystemBoardSortStatus(boardId), 'board-sort-criteria', 'board-sort-reverse-checkbox', 'board-sort-reminders-top-checkbox');
            const clearOrderBtn = document.getElementById('board-order-clear-btn');
            const saveOrderBtn = document.getElementById('board-order-save-btn');
            if (clearOrderBtn) {
                clearOrderBtn.onclick = () => {
                    const activeBoardId = boardOrderModal.dataset.systemBoardId;
                    if (activeBoardId) localStorage.removeItem(getSystemBoardSortKey(activeBoardId));
                    boardOrderModal.classList.remove('visible');
                    applyFilters();
                    showToast(_('settingSaved'), 2000);
                };
            }
            if (saveOrderBtn) {
                saveOrderBtn.onclick = () => {
                    const activeBoardId = boardOrderModal.dataset.systemBoardId;
                    const sortStatus = getSortStatusFromControls('board-sort-criteria', 'board-sort-reverse-checkbox', 'board-sort-reminders-top-checkbox');
                    if (activeBoardId) localStorage.setItem(getSystemBoardSortKey(activeBoardId), String(sortStatus));
                    boardOrderModal.classList.remove('visible');
                    applyFilters();
                    showToast(_('settingSaved'), 2000);
                };
            }
            boardOrderModal.classList.add('visible');
        });
    }
    // Start Board
    let startBoardSelect; // Declare here to be accessible in the whole function
    startBoardSelect = document.getElementById('start-board-select');
    const currentFolder = localStorage.getItem('active_folder_name') || 'multinotes_data';
    startBoardSelect.value = localStorage.getItem('startBoard') || 'Main';
    startBoardSelect.addEventListener('change', () => {
        localStorage.setItem('startBoard', startBoardSelect.value);
        const af = localStorage.getItem('active_folder_name') || 'multinotes_data';
        localStorage.setItem('startBoard_' + af, startBoardSelect.value);
        showToast(_('settingSaved'), 2000);
    });
    // Max Searches
    // let maxSearchesInput; // Declare here as well
    maxSearchesInput.value = maxSavedSearches;
    maxSearchesInput.addEventListener('change', () => {
        let newValue = parseInt(maxSearchesInput.value, 10);
        if (isNaN(newValue) || newValue < 0) newValue = 0;
        if (newValue > 20) newValue = 20;
        maxSavedSearches = newValue;
        localStorage.setItem('maxSavedSearches', newValue);
        // Trim existing searches if new limit is smaller
        if (savedSearches.length > maxSavedSearches) {
            savedSearches.length = maxSavedSearches;
            localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
        }
        showToast(_('settingSaved'), 2000);
    });
    // --- New Data Source Selection Logic ---
    const dataSources = [
        { checkbox: useGoogleDbCheckbox, key: 'useGoogleDb' },
        { checkbox: useLocalDbCheckbox, key: 'useLocalDb' },
        { checkbox: useArhDbCheckbox, key: 'useArhDb' }
    ];
    const handleDataSourceChange = (changedCheckbox, changedKey) => {
        // Ако се опитваме да премахнем отметка и базата данни НЕ съществува
        if (!changedCheckbox.checked && !dbExists) {
            showToast(_('errorNoDataSourceSelected'), 5000);
            // Не позволяваме премахването, като връщаме отметката
            changedCheckbox.checked = true;
            return;
        }
        if (changedCheckbox.checked) {
            // Преди да запишем в localStorage, проверяваме дали имаме избрана папка
            if (changedKey === 'useLocalDb' || changedKey === 'useArhDb') {
                const display = (changedKey === 'useLocalDb') ?
                    document.getElementById('local-sync-folder-name') :
                    document.getElementById('arh-folder-name');

                if (!display || display.textContent === _('folderNotSelected')) {
                    // Не записваме в localStorage, махаме отметката и отваряме избора на папка
                    changedCheckbox.checked = false;
                    const btnId = (changedKey === 'useLocalDb') ? 'select-folder-btn' : 'select-arh-btn';
                    document.getElementById(btnId).click();
                    return;
                }
            }
            // Uncheck all other data sources
            dataSources.forEach(({ checkbox, key }) => {
                if (key !== changedKey) {
                    checkbox.checked = false;
                    localStorage.setItem(key, 'false');
                }
            });
        }
        // Save the state of the changed checkbox
        localStorage.setItem(changedKey, changedCheckbox.checked);
        showToast(_('settingSaved'), 2000);
        updateModeButton();
    };
    dataSources.forEach(({ checkbox, key }) => {
        checkbox.addEventListener('change', () => handleDataSourceChange(checkbox, key));
    });
    // indexedDB
    // Задаваме първоначалното състояние на чекбокса от localStorage
    useIndexedDbCheckbox.checked = localStorage.getItem('useIndexedDb') === 'true';
    // Add event listeners
    useIndexedDbCheckbox.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;

        // --- ПРОВЕРКИ ЗА ВАЛИДНОСТ НА БАЗАТА ДАННИ ---
        if (isChecked && dbExists) {
            try {
                // 1. Проверка на папката
                const dbCreatedFolderName = await getConfig('dbCreatedFolderName');
                if (dbCreatedFolderName) {
                    const activeFolder = localStorage.getItem('active_folder_name') || 'multinotes_data';
                    if (dbCreatedFolderName !== activeFolder) {
                        const msg = (_('dbFolderMismatch') || 'Внимание: БД е създадена за папка "{dbFolder}", а текущата е "{activeFolder}".')
                            .replace('{dbFolder}', dbCreatedFolderName)
                            .replace('{activeFolder}', activeFolder);
                        showToast(msg, 5000);
                        // Оставяме отметката включена и не връщаме (return), само информираме
                    }
                }

                // 2. Проверка на потребителя (собственика)
                const dbOwnerEmail = await getConfig('userEmail');
                if (dbOwnerEmail) {
                    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint') || localStorage.getItem('google_login_hint');
                    // Сравняваме само ако имаме и двата имейла. 
                    if (currentUserEmail && dbOwnerEmail !== currentUserEmail) {
                        e.target.checked = false;
                        localStorage.setItem('useIndexedDb', 'false');
                        const msg = (_('dbOwnerMismatch') || 'Грешка: БД принадлежи на {dbOwner}, а текущият потребител е {currentUser}.')
                            .replace('{dbOwner}', dbOwnerEmail)
                            .replace('{currentUser}', currentUserEmail);
                        showToast(msg, 5000);
                        return;
                    }
                }
            } catch (err) {
                console.error("Error validating DB config:", err);
            }
        }

        localStorage.setItem('useIndexedDb', isChecked);
        // --- КОРЕКЦИЯ: Само ако базата НЕ съществува, симулираме клик на "Създай" ---
        if (isChecked) {
            if (!dbExists) {
                document.getElementById('create-db-btn').click();
            } else {
                updateGlobalStateFlags();
                updateModeButton();
                showToast(_('settingSaved'), 2000);
            }
        } else {
            updateGlobalStateFlags();
            updateModeButton();
            showToast(_('settingSaved'), 2000);
        }
    });
    // Accordion logic
    const accordionHeader = document.querySelector('.accordion-header');
    if (accordionHeader) {
        accordionHeader.addEventListener('click', () => {
            const accordion = accordionHeader.parentElement;
            accordion.classList.toggle('active');
            const content = accordion.querySelector('.accordion-content');
            const advancedSettingsDiv = document.getElementById('advanced-settings');
            const dataFoldersDiv = document.getElementById('data-folders');
            const settingsModalBody = document.getElementById('settings-modal-body');

            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                if (advancedSettingsDiv) advancedSettingsDiv.style.display = 'none'; // Hide content when collapsed
                if (dataFoldersDiv) {
                    dataFoldersDiv.style.maxHeight = null;
                    dataFoldersDiv.style.display = 'none';
                }
                if (settingsModalBody) {
                    settingsModalBody.style.overflowY = 'auto'; // Възстановяваме скролбара, ако е бил скрит
                }
            } else {
                if (advancedSettingsDiv) advancedSettingsDiv.style.display = 'block'; // Show content before calculating height
                if (dataFoldersDiv) {
                    dataFoldersDiv.style.display = 'block';
                    dataFoldersDiv.style.maxHeight = dataFoldersDiv.scrollHeight + "px";
                }
                content.style.maxHeight = content.scrollHeight + "px";

                // Скролираме модала надолу, за да видим отворената секция
                if (settingsModalBody) {
                    // Временно скриваме скролбара, докато се скролира
                    settingsModalBody.style.overflowY = 'hidden';
                    // Изчакваме анимацията на акордеона да завърши (300ms)
                    setTimeout(() => {
                        settingsModalBody.scrollTo({
                            top: settingsModalBody.scrollHeight,
                            behavior: 'smooth'
                        });
                        // Изчакваме и скролирането да приключи (още около 500ms)
                        setTimeout(() => {
                            settingsModalBody.style.overflowY = 'auto'; // Възстановяваме скролбара
                        }, 500);
                    }, 300);
                }
            }
        });
    }
    // --- End of DB Section ---
    // DB delete
    const createDbBtn = document.getElementById('create-db-btn');
    createDbBtn.addEventListener('click', async () => {
        let confirmed = false;
        // Проверяваме дали базата съществува И дали не е празна.
        const boardsInDb = dbExists ? await getAllFromDB(BOARD_STORE_NAME) : [];
        if (dbExists && boardsInDb.length > 0) {
            // Показваме диалог за потвърждение само ако базата съществува и има данни.
            document.getElementById('settings-modal').classList.remove('visible');
            updateModeButton();
            await new Promise(resolve => setTimeout(resolve, 150));
            confirmed = await showConfirmation(_('confirmDbRecreate'));

            if (!confirmed) {
                // Ако потребителят откаже презапис, проверяваме дали данните съвпадат
                const memBoards = (typeof boardsData !== 'undefined') ? boardsData : [];
                if (!areBoardsIdentical(memBoards, boardsInDb)) {
                    // Вече само предупреждаваме, без да блокираме
                    console.warn("DB Identity Check: Some boards in DB not found in current memory. This might be normal during state transitions.");
                    dbExists = true;
                    updateGlobalStateFlags();
                    updateModeButton();
                    return; // Спираме процеса тук, но не махаме отметката
                }
                // Ако са идентични, позволяваме включването без презапис
                dbExists = true;
                updateGlobalStateFlags();
                updateModeButton();
                return;
            }
        } else {
            // Ако базата не съществува или е празна, продължаваме директно със създаването.
            confirmed = true;
        }
        if (confirmed) {
            const success = await createDatabaseFromMemory();
            if (success) {
                showToast(_('dbCreated'), 10000);
                dbExists = true;
                // --- КОРЕКЦИЯ: Автоматично включваме отметката при успешно създаване ---
                const cb = document.getElementById('use-indexeddb-checkbox');
                if (cb) {
                    cb.checked = true;
                    localStorage.setItem('useIndexedDb', 'true');
                    updateGlobalStateFlags();
                    updateModeButton();
                }
            }
        }
    });
    const deleteDbBtn = document.getElementById('delete-db-btn');
    deleteDbBtn.addEventListener('click', async () => {
        // --- КОРЕКЦИЯ: Запомняме дали сме в режим "Само база данни" ПРЕДИ изтриването ---
        const isDbOnlyMode =
            document.getElementById('use-indexeddb-checkbox').checked &&
            !document.getElementById('use-google-db-checkbox').checked &&
            !document.getElementById('use-local-db-checkbox').checked &&
            !document.getElementById('use-arh-db-checkbox').checked;
        // Затваряме настройките, за да се видят диалозите за потвърждение
        document.getElementById('settings-modal').classList.remove('visible');
        // Изчакваме анимацията на затваряне да приключи, преди да покажем новия диалог
        await new Promise(resolve => setTimeout(resolve, 150));
        const confirmedDataDelete = await showConfirmation(_('confirmDbDelete'));
        if (confirmedDataDelete) {
            const dirH = await getConfig('directoryHandle');
            const arH = await getConfig('arhHandle');
            const hasFolderHandles = !!(dirH || arH);
            let confirmedConfigDelete = false;
            if (hasFolderHandles) {
                confirmedConfigDelete = await showConfirmation(_('confirmConfigDelete'), {
                    backgroundColor: '#lightgreen',
                    width: '450px'
                });
            } else {
                confirmedConfigDelete = true;
            }
            if (confirmedConfigDelete) {
                // Потребителят иска да изтрие всичко, включително настройките
                await deleteNotesDB();
                // Нулираме UI елементите за избраните папки
                const folderNameDisplay = document.getElementById('local-sync-folder-name');
                const arhFolderNameDisplay = document.getElementById('arh-folder-name');
                if (folderNameDisplay) folderNameDisplay.textContent = _('folderNotSelected');
                if (arhFolderNameDisplay) arhFolderNameDisplay.textContent = _('folderNotSelected');
                dbExists = false; // Актуализираме глобалния флаг
                // --- НОВА ЛОГИКА: Премахваме отметките за локални източници ---
                const localCheckbox = document.getElementById('use-local-db-checkbox');
                const arhCheckbox = document.getElementById('use-arh-db-checkbox');
                if (localCheckbox) localCheckbox.checked = false;
                if (arhCheckbox) arhCheckbox.checked = false;
                localStorage.setItem('useLocalDb', 'false');
                localStorage.setItem('useArhDb', 'false');
                dirHandle = null; // Нулираме и handle-a в паметта
            } else {
                // Потребителят иска да изтрие само данните, но да запази настройките
                await clearDbStores();
            }
            // Изчистваме настройката за стартов борд, тъй като бордовете вече не съществуват
            localStorage.removeItem('startBoard');
            // --- НОВА МИНИМАЛНА КОРЕКЦИЯ ---
            // След успешно изтриване, ВИНАГИ премахваме отметката и обновяваме localStorage.
            showToast(_('dbDeleted'), 5000);
            const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
            useIndexedDbCheckbox.checked = false;
            localStorage.setItem('useIndexedDb', 'false');
            // Ако сме били в режим "Само база данни", автоматично включваме Google Drive
            if (isDbOnlyMode) {
                localStorage.setItem('useGoogleDb', 'true');
                document.getElementById('use-google-db-checkbox').checked = true;
                updateGlobalStateFlags();
                await mainLogic(); // ПРЕЗАРЕЖДАМЕ ЛОГИКАТА
            }
            // --- КОРЕКЦИЯ: Актуализираме иконата за режим веднага ---
            updateModeButton();
        } else {
            // Ако потребителят откаже изтриването, отваряме настройките отново, за да не остава празен екран.
            document.getElementById('settings-modal').classList.add('visible');
        }
        // Активираме контролите, в случай че са били деактивирани от userCheck
        enableSettingsControls();
    });
    // --- Local Sync Folder ---
    selectFolderBtn.addEventListener('click', async () => {
        try {
            const handle = await window.showDirectoryPicker();
            if (handle) {
                const validationResult = await validateFolderContent(handle);
                if (!validationResult.isValid) {
                    let warningMessage = _('invalidDataFolder').replace('{folderName}', handle.name);
                    if (validationResult.reason === 'criteria_not_met') {
                        warningMessage += " " + _('requiredFilesForLocalFolder');
                    }
                    showToast(warningMessage, 15000);
                    return;
                }
                await saveConfig('directoryHandle', handle);
                dirHandle = handle;
                folderNameDisplay.textContent = handle.name;
                folderNameDisplay.title = handle.name;
                showToast(_('folderSelectedForSync').replace('{folderName}', handle.name), 10000);

                // Актуализираме отметката и localStorage
                const localCheckbox = document.getElementById('use-local-db-checkbox');
                if (localCheckbox) localCheckbox.checked = true;
                localStorage.setItem('useLocalDb', 'true');

                // Изключваме другите източници
                localStorage.setItem('useGoogleDb', 'false');
                localStorage.setItem('useArhDb', 'false');
                const googleCheckbox = document.getElementById('use-google-db-checkbox');
                const arhCheckbox = document.getElementById('use-arh-db-checkbox');
                if (googleCheckbox) googleCheckbox.checked = false;
                if (arhCheckbox) arhCheckbox.checked = false;

                const settingsModal = document.getElementById('settings-modal');
                const settings2Modal = document.getElementById('settings2-modal');
                if (settingsModal) settingsModal.classList.remove('visible');
                if (settings2Modal) settings2Modal.classList.remove('visible');

                updateModeButton();
                mainLogic();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.log("Error selecting directory:", error);
            }
        }
    });
    // --- Archive Folder Setting ---
    const selectArhBtn = document.getElementById('select-arh-btn');
    const arhFolderNameDisplay = document.getElementById('arh-folder-name');
    selectArhBtn.addEventListener('click', async () => {
        try {
            const handle = await window.showDirectoryPicker(); // Prompt user to select
            if (handle) {
                const validationArh = await validateArhFolderContent(handle);
                if (!validationArh.isValid) {
                    let warningMessage = _('invalidDataFolder').replace('{folderName}', handle.name);
                    if (validationArh.reason === 'criteria_not_met') {
                        warningMessage += " " + _('requiredFilesForLocalFolder');
                    }
                    showToast(warningMessage, 15000);
                    return;
                }
                arhFolderNameDisplay.textContent = handle.name;
                arhFolderNameDisplay.title = handle.name;
                dirHandle = handle; // <--- ДОБАВЕН РЕД
                await saveConfig('arhHandle', handle); // Запазваме избраната папка

                // Актуализираме отметката и localStorage
                const arhCheckbox = document.getElementById('use-arh-db-checkbox');
                if (arhCheckbox) arhCheckbox.checked = true;
                localStorage.setItem('useArhDb', 'true');

                // Изключваме другите източници
                localStorage.setItem('useGoogleDb', 'false');
                localStorage.setItem('useLocalDb', 'false');
                const googleCheckbox = document.getElementById('use-google-db-checkbox');
                const localCheckbox = document.getElementById('use-local-db-checkbox');
                if (googleCheckbox) googleCheckbox.checked = false;
                if (localCheckbox) localCheckbox.checked = false;

                const settingsModal = document.getElementById('settings-modal');
                const settings2Modal = document.getElementById('settings2-modal');
                if (settingsModal) settingsModal.classList.remove('visible');
                if (settings2Modal) settings2Modal.classList.remove('visible');

                showToast(_('folderSelectedForArh').replace('{folderName}', handle.name), 5000);
                // КЛЮЧОВА КОРЕКЦИЯ: Обновяваме флаговете ПРЕДИ да извикаме mainLogic
                updateGlobalStateFlags();

                updateModeButton();
                // След избор, просто презареждаме основната логика,
                // която вече ще види, че е избран режим "Архив".
                mainLogic();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.log("Error selecting directory:", error);
            }
        }
    });
    // Close
    document.getElementById('settings-close-btn').addEventListener('click', async (e) => {
        if (e && e.ctrlKey) return; // Allow Ctrl-Click toggle behavior to fire without closing the UI

        /* const configData = await exportConfig();
        console.log("configData: ", configData); // Ще изведе масива с ключ/стойност от config store-a */
        const currentState = {
            useGoogleDb: document.getElementById('use-google-db-checkbox').checked,
            useLocalDb: document.getElementById('use-local-db-checkbox').checked,
            useArhDb: document.getElementById('use-arh-db-checkbox').checked,
            useIndexedDb: document.getElementById('use-indexeddb-checkbox').checked
        };

        // --- STRICT VALIDATION FIRST ---
        updateGlobalStateFlags();
        if (!validateDataSourceSelection()) {
            // If validation fails, DO NOT close the modal.
            // toast is shown by validateDataSourceSelection
            return;
        }

        document.getElementById('settings-modal').classList.remove('visible');
        if (window.kbAssistant) window.kbAssistant.terminateGuide();
        // Винаги обновяваме бутона, за да отрази актуалното състояние от localStorage
        updateModeButton();
        const hasChanged = JSON.stringify(settingsInitialState) !== JSON.stringify(currentState);
        if (window.wasOpenedForMissingFolder) {
            window.wasOpenedForMissingFolder = false; // Нулираме флага
            mainLogic(); // Извикваме основната логика отново
        } else if (hasChanged) {
            mainLogic(); // Извикваме основната логика отново
        }
    });
    settingsModalBody.dataset.initialized = true;
}
// Always ensure the delete folder button has a listener (outside the initialization guard)
const deleteFolderBtn = document.getElementById('delete-folder-btn');
if (deleteFolderBtn) {
    deleteFolderBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showFolderDeletePopup();
    };
}

// При инициализация на UI, проверяваме дали разширените настройки трябва да са видими
// Разширените настройки вече са част от settings2-modal и са винаги видими
const advancedSettings = document.getElementById('advanced-settings');
if (advancedSettings) {
    // Вече не се скриват
    advancedSettings.removeAttribute('hidden');
}

// Асинхронно зареждане на името на папката за архив и локална синхронизация