/** terser msm.js -c 'pure_funcs=["console.log"]' --format comments=false --output msm.js */

console.log("msm.js loaded");
let container;
let stepTimer;
let currentActiveStep = null;
let stepTime = 10000;
let animationFrameId; // defined in msmguide.js but let's be safe
let activeSteps = typeof steps !== 'undefined' ? steps : [];
let isTempNoteOpen = false;
let currentOriginalTranslation = { key: null, value: null }; // For simple undo

window.setGuideSteps = function (newSteps) {
  activeSteps = newSteps;
};

window.showGuideStep = function (step) {
  if (container) {
    container.remove();
    container = null;
  }
  showStep(step, null, true);
}

window.toggleHero = function () {
  if (container && document.body.contains(container)) {
    container.remove();
    container = null;
    const dbg = document.getElementById('msm-debug-overlay');
    if (dbg) dbg.remove();
    if (stepTimer) clearTimeout(stepTimer);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Deactivate Translate Mode if active
    if (window.isTranslateMode) {
      window.isTranslateMode = false;
      if (typeof window.removeTranslateOverlay === 'function') {
        window.removeTranslateOverlay();
      }
    }
    return false;
  } else {
    if (activeSteps.length === 0) {
      // Default debug step
      const debugStep = {
        image: 'msm/l-up.png',
        text: { bg: 'Здравей! Аз съм твоят асистент в Debug режим. 🐛', en: 'Hello! I am your assistant in Debug mode. 🐛' },
        x: 20,
        y: 20,
        target: '#search-box',
        bx: 0, by: 120,
        bWidth: 220, bHeight: 100
      };
      showStep(debugStep);
    } else {
      let step = { ...activeSteps[0] };
      // Ако първата стъпка няма target, насочваме я към search-box за сигурност
      if (!step.target || step.target === 'html' || step.target === 'body') {
        step.target = '#search-box';
        step.x = (step.x || 0) + 20;
        step.y = (step.y || 0) + 20;
      }
      showStep(step);
    }
    return true;
  }
};

// Make showStep globally available for internal use (if needed) but showGuideStep is preferred for single steps
window.showStep = showStep;

// Expose removeGuide for external control (e.g. from KB Assistant)
window.removeGuide = function (force = false) {
  // Не скриваме асистента в режим на превод, освен ако не е форсирано
  if (window.isTranslateMode && !force) return;

  if (container) {
    container.remove();
    container = null;
  }
  let dbg = document.getElementById('msm-debug-overlay');
  if (dbg) dbg.remove();
  let trOverlay = document.getElementById('msm-translate-overlay');
  if (trOverlay) {
    trOverlay.remove();
    window.isTranslateMode = false;
  }
  if (stepTimer) clearTimeout(stepTimer);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (isTempNoteOpen) {
    const modal = document.getElementById('content-modal');
    if (modal) modal.classList.remove('visible');
    isTempNoteOpen = false;
  }
};

window.centerHero = function () {
  if (!container) {
    toggleHero();
  }
  if (!container) return;

  // Stop automatic positioning permanently for this mode
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Detach from current target to prevent snapping back
  targetEl = document.body;

  container.style.visibility = 'hidden';
  container.style.opacity = '0';
  container.style.transition = 'none';

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const containerRect = container.getBoundingClientRect();
  const centerX = (viewportWidth - containerRect.width) / 2;
  const centerY = (viewportHeight - containerRect.height) / 2;

  container.style.left = centerX + window.scrollX + 'px';
  container.style.top = centerY + window.scrollY + 'px';
  container.style.position = 'fixed';
  container.style.visibility = 'visible';
  container.style.opacity = '1';

  // Hide speech bubble in translate mode
  const bubble = container.querySelector('.speech-bubble');
  if (bubble) bubble.style.display = 'none';
};

window.initTranslateOverlay = function () {
  if (currentActiveStep) {
    currentActiveStep.image = 'msm/l-up.png';
    currentActiveStep.height = 100;
  }
  if (container) {
    container.style.zIndex = '200000'; // Even higher than board reorder overlay (100000)
    const img = container.querySelector('.guide-img');
    if (img) {
      img.src = 'msm/l-up.png';
      img.style.height = '100px';
      img.style.width = 'auto';
    }
  }
  let trOverlay = document.getElementById('msm-translate-overlay');
  if (!trOverlay) {
    trOverlay = document.createElement('div');
    trOverlay.id = 'msm-translate-overlay';
    trOverlay.style.cssText = 'position:fixed !important; top:0px !important; left:0px !important; background:rgba(0,0,0,0.9) !important; color:white !important; padding:4px 8px !important; border-radius:6px !important; z-index:200001 !important; display:flex !important; align-items:flex-start !important; gap:8px !important; width:calc(100vw - 10px) !important; box-sizing:border-box !important; font-family:sans-serif !important; box-shadow:0 4px 20px rgba(0,0,0,0.6) !important; border:1px solid #555 !important;';
    trOverlay.innerHTML = `
      <div id="msm-tr-lang" style="font-size:12px; font-weight:bold; color:#00ff00; opacity:0.8; padding:4px 6px; border-right:1px solid #444; flex-shrink:0;">--</div>
      <div id="msm-tr-key" style="font-family:monospace; color:#00ff00; font-size:12px; background:rgba(0,255,0,0.1); padding:4px 8px; border-radius:4px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; margin-top:2px;" title="No data-key">No data-key</div>
      <textarea id="msm-tr-val" rows="1" placeholder="..." style="flex:1 !important; min-width:100px !important; background:#000 !important; color:#fff !important; border:1px solid #444 !important; border-radius:4px !important; padding:4px 8px !important; font-size:14px !important; outline:none !important; resize:none !important; height:28px; line-height:1.4 !important; box-sizing:border-box !important; transition:border-color 0.2s; overflow-y:hidden !important;"></textarea>
      <button id="msm-tr-apply" style="background:#00ff00 !important; color:#000 !important; border:none !important; border-radius:4px !important; padding:6px 15px !important; font-weight:bold !important; cursor:pointer !important; font-size:11px !important; flex-shrink:0 !important; white-space:nowrap !important;">APPLY</button>
      <button id="msm-tr-undo" style="background:#ffaa00 !important; color:#000 !important; border:none !important; border-radius:4px !important; padding:6px 15px !important; font-weight:bold !important; cursor:pointer !important; font-size:11px !important; flex-shrink:0 !important; white-space:nowrap !important; display:none;">UNDO</button>
    `;
    document.body.appendChild(trOverlay);

    // Hide debug overlay while translating to avoid overlap
    const dbgOverlay = document.getElementById('msm-debug-overlay');
    if (dbgOverlay) dbgOverlay.style.display = 'none';

    const textarea = trOverlay.querySelector('#msm-tr-val');
    const applyBtn = trOverlay.querySelector('#msm-tr-apply');
    const undoBtn = trOverlay.querySelector('#msm-tr-undo');

    const syncHeight = () => {
      textarea.style.height = '24px'; // Base height
      const newHeight = Math.min(textarea.scrollHeight, 200); // Max height 200px
      textarea.style.height = newHeight + 'px';
    };

    // Auto-resize logic
    textarea.addEventListener('input', () => {
      syncHeight();
      // Показваме отново бутона APPLY, ако потребителят започне да пише след промяна
      if (applyBtn.style.display === 'none') {
        applyBtn.style.display = 'block';
        if (undoBtn) undoBtn.style.display = 'none';
      }
    });

    // Backup current translations to localStorage if not already present
    const lang = (localStorage.getItem('language') || 'en').toLowerCase();
    const backupKey = `i18n_backup_${lang}`;
    const allTranslations = typeof appTranslations !== 'undefined' ? appTranslations : window.appTranslations;
    if (!localStorage.getItem(backupKey) && allTranslations && allTranslations[lang]) {
      console.log(`[msm.js] Creating translation backup for ${lang}`);
      localStorage.setItem(backupKey, JSON.stringify(allTranslations[lang]));
    }

    // Излагаме функцията глобално, за да може логиката за идентификация да я извиква
    window.syncMsmTranslateHeight = syncHeight;

    const updateUIElements = (key, val) => {
      const elements = document.querySelectorAll(`[data-key="${key}"], [data-key-placeholder="${key}"], [data-key-title="${key}"]`);
      elements.forEach(el => {
        if (el.getAttribute('data-key') === key) {
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = val;
          else el.innerHTML = val;
        }
        if (el.getAttribute('data-key-placeholder') === key) el.placeholder = val;
        if (el.getAttribute('data-key-title') === key) el.title = val;
      });
    }

    const applyTranslation = () => {
      const keyEl = document.getElementById('msm-tr-key');
      const key = keyEl ? keyEl.innerText : '';
      const isDynamic = key.includes('No data-key');
      const val = textarea.value;
      const lang = (localStorage.getItem('language') || 'en').toLowerCase();
      const allTranslations = typeof appTranslations !== 'undefined' ? appTranslations : window.appTranslations;

      if (!isDynamic && key && key !== 'No data-key found' && allTranslations && allTranslations[lang]) {
        allTranslations[lang][key] = val;
        updateUIElements(key, val);

        // Update localStorage backup
        const backupKey = `i18n_backup_${lang}`;
        localStorage.setItem(backupKey, JSON.stringify(allTranslations[lang]));

        // Feedback and release focus
        applyBtn.style.background = '#fff';
        applyBtn.innerText = 'APPLIED!';
        textarea.blur();

        setTimeout(() => {
          applyBtn.style.background = '#00ff00';
          applyBtn.innerText = 'APPLY';
          // Show undo and hide apply
          if (undoBtn && currentOriginalTranslation.key === key) {
            undoBtn.style.display = 'block';
            applyBtn.style.display = 'none';
          }
        }, 800);
      }
    };

    const undoTranslation = () => {
      const keyEl = document.getElementById('msm-tr-key');
      const currentKey = keyEl ? keyEl.innerText : '';
      const lang = (localStorage.getItem('language') || 'en').toLowerCase();
      const allTranslations = typeof appTranslations !== 'undefined' ? appTranslations : window.appTranslations;

      if (currentOriginalTranslation.key === currentKey && allTranslations && allTranslations[lang]) {
        const originalVal = currentOriginalTranslation.value;
        allTranslations[lang][currentKey] = originalVal;
        updateUIElements(currentKey, originalVal);
        textarea.value = originalVal;
        if (typeof window.syncMsmTranslateHeight === 'function') window.syncMsmTranslateHeight();

        // Feedback on undo button
        const originalBg = undoBtn.style.background;
        const originalText = undoBtn.innerText;
        undoBtn.style.background = '#fff';
        undoBtn.innerText = 'REVERTED';
        setTimeout(() => {
          undoBtn.style.background = originalBg;
          undoBtn.innerText = originalText;
          if (undoBtn) undoBtn.style.display = 'none';
          if (applyBtn) applyBtn.style.display = 'block';
        }, 600);
      }
    };

    applyBtn.addEventListener('click', applyTranslation);
    undoBtn.addEventListener('click', undoTranslation);
    applyBtn.addEventListener('mousedown', () => applyBtn.style.transform = 'scale(0.95)');
    applyBtn.addEventListener('mouseup', () => applyBtn.style.transform = 'scale(1)');

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        applyTranslation();
      }
    });

    textarea.addEventListener('focus', () => textarea.style.borderColor = '#00ff00');
    textarea.addEventListener('blur', () => textarea.style.borderColor = '#444');
  }

  window.updateTranslateOverlayPosition = function (pY) {
    // No longer needed for top-fixed minimalist overlay
  };

  const langSpan = document.getElementById('msm-tr-lang');
  if (langSpan) langSpan.innerText = (localStorage.getItem('language') || 'en').toUpperCase();
};

window.removeTranslateOverlay = function () {
  const trOverlay = document.getElementById('msm-translate-overlay');
  if (trOverlay) trOverlay.remove();

  // Restore debug overlay
  const dbgOverlay = document.getElementById('msm-debug-overlay');
  if (dbgOverlay) dbgOverlay.style.display = 'block';

  if (container) {
    container.style.zIndex = '12000'; // Reset to default from CSS
    const bubble = container.querySelector('.speech-bubble');
    if (bubble) bubble.style.display = 'block';
  }
};

window.saveTranslationsFile = function () {
  const lang = localStorage.getItem('language') || 'en';
  const allTranslations = typeof appTranslations !== 'undefined' ? appTranslations : window.appTranslations;

  if (!allTranslations || !allTranslations[lang]) {
    alert('No translations found to save.');
    return;
  }
  const data = JSON.stringify(allTranslations[lang], null, 2);

  // Clear backup on successful intent to save
  const backupKey = `i18n_backup_${lang}`;
  localStorage.removeItem(backupKey);

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `i18n-${lang}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

window.restoreTranslations = function () {
  const lang = (localStorage.getItem('language') || 'en').toLowerCase();
  const backupKey = `i18n_backup_${lang}`;
  const backupData = localStorage.getItem(backupKey);
  const allTranslations = typeof appTranslations !== 'undefined' ? appTranslations : window.appTranslations;

  if (!backupData) {
    return {
      success: false,
      message: lang === 'bg' ? 'Няма намерен архив за възстановяване.' : 'No backup found to restore.'
    };
  }

  try {
    const backup = JSON.parse(backupData);
    if (allTranslations && allTranslations[lang]) {
      // Merge/Overrule current translations with backup
      Object.assign(allTranslations[lang], backup);

      // Update UI for all restored keys
      Object.keys(backup).forEach(key => {
        const val = backup[key];
        // We need updateUIElements but it is defined inside initTranslateOverlay scope...
        // Wait, I should make updateUIElements globally accessible or use the one from main.js if exists.
        // Actually, updateUIElements in initTranslateOverlay is local.
        // Let's use a global version or redefine it here.
        const elements = document.querySelectorAll(`[data-key="${key}"], [data-key-placeholder="${key}"], [data-key-title="${key}"]`);
        elements.forEach(el => {
          if (el.getAttribute('data-key') === key) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = val;
            else el.innerHTML = val;
          }
          if (el.getAttribute('data-key-placeholder') === key) el.placeholder = val;
          if (el.getAttribute('data-key-title') === key) el.title = val;
        });
      });

      return {
        success: true,
        message: lang === 'bg' ? 'Преводите са възстановени от архива.' : 'Translations restored from backup.'
      };
    }
  } catch (e) {
    console.error('Error restoring translations:', e);
    return {
      success: false,
      message: 'Error during restoration.'
    };
  }
  return { success: false, message: 'Restore failed (unexpected state).' };
};

// Global function to flip image
window.msmFlipImage = function () {
  if (!currentActiveStep || !container) {
    console.warn('No active step to flip image for');
    return;
  }
  const imgEl = container.querySelector('.guide-img');
  const imgRect = imgEl ? imgEl.getBoundingClientRect() : { width: currentActiveStep.height || 100, height: currentActiveStep.height || 100 };
  const oldWidth = imgRect.width;
  const oldHeight = imgRect.height;
  let src = currentActiveStep.image;
  let newSrc = src;
  // Cycle: r-up -> l-up -> l-down -> r-down -> r-up
  let transition = ''; // 'rl' (Right to Left), 'lr', 'tb' (Top to Bottom), 'bt'
  if (src.includes('r-up')) {
    newSrc = src.replace('r-up', 'l-up');
    transition = 'rl';
  } else if (src.includes('l-up')) {
    newSrc = src.replace('l-up', 'l-down');
    transition = 'tb'; // Top to Bottom (Left stays Left)
  } else if (src.includes('l-down')) {
    newSrc = src.replace('l-down', 'r-down');
    transition = 'lr';
  } else if (src.includes('r-down')) {
    newSrc = src.replace('r-down', 'r-up');
    transition = 'bt'; // Bottom to Top (Right stays Right)
  }
  if (newSrc !== src) {
    currentActiveStep.image = newSrc;
    if (imgEl) {
      const cleanSrc = newSrc.endsWith('!') ? newSrc.slice(0, -1) : newSrc;
      // Load new image
      imgEl.src = cleanSrc;
      // Handle the coordinate shift AFTER the new image dimensions are known
      imgEl.onload = () => {
        const newRect = imgEl.getBoundingClientRect();
        const newWidth = newRect.width;
        const newHeight = newRect.height;
        let xChange = 0;
        let yChange = 0;
        // Logic: Keep the pointer tip at the same screen location.
        // We adjust the Top-Left (x, y) of the image to make this happen.
        // Pointers:
        // l-up: (0, 10)
        // r-up: (W, 10)
        // l-down: (0, H-10)
        // r-down: (W, H-10)
        if (transition === 'rl') {
          // r-up (W, 10) -> l-up (0, 10)
          // Old Pointer X = OldX + OldW
          // New Pointer X = NewX + 0
          // NewX = OldX + OldW
          xChange = oldWidth;
          // Y: 10 -> 10 (No change)
        } else if (transition === 'tb') {
          // l-up (0, 10) -> l-down (0, H-10)
          // Old Pointer Y = OldY + 10
          // New Pointer Y = NewY + NewH - 10
          // OldY + 10 = NewY + NewH - 10  => NewY = OldY + 20 - NewH
          yChange = 20 - newHeight;
          // X: 0 -> 0 (No change)
        } else if (transition === 'lr') {
          // l-down (0, H-10) -> r-down (W, H-10)
          // Old Pointer X = OldX + 0
          // New Pointer X = NewX + NewW
          // NewX = OldX - NewW
          xChange = -newWidth;
          // Y: H-10 -> H-10 (Roughly no change if height is same? but let's be technically precise)
          // OldY + OldH - 10 = NewY + NewH - 10 => NewY = OldY + OldH - NewH
          yChange = oldHeight - newHeight;
        } else if (transition === 'bt') {
          // r-down (W, H-10) -> r-up (W, 10)
          // Old Pointer Y = OldY + OldH - 10
          // New Pointer Y = NewY + 10
          // NewY = OldY + OldH - 20
          yChange = oldHeight - 20;
          // X: W -> W. NewX = OldX + OldW - NewW
          xChange = oldWidth - newWidth;
        }
        currentActiveStep.x = (currentActiveStep.x || 0) + xChange;
        currentActiveStep.y = (currentActiveStep.y || 0) + yChange;
        const debugOverlay = document.getElementById('msm-debug-overlay');
        if (debugOverlay) {
          debugOverlay.innerText = `Flipped: ${transition}\nNew x: ${Math.round(currentActiveStep.x)}\nNew y: ${Math.round(currentActiveStep.y)}`;
        }
      };
    };
  }
};

// Функция за обновяване на езика на текущия балон
window.refreshGuideLanguage = function () {
  if (!container || !document.body.contains(container) || !currentActiveStep) return;

  // Взимаме новия език
  let newLang = localStorage.getItem('language') || 'en';
  let step = currentActiveStep;

  // Намираме текста за новия език
  let newText = '';
  if (step.text) {
    if (typeof step.text === 'object') {
      newText = step.text[newLang] || step.text['en'] || '';
    } else {
      newText = step.text;
    }
  } else if (typeof guideTexts !== 'undefined' && step.textKey) {
    newText = guideTexts[newLang] ? guideTexts[newLang][step.textKey] : '';
  }

  // Обновяваме текста в DOM
  const bubble = container.querySelector('.speech-bubble');
  if (bubble) {
    const span = bubble.querySelector('span');
    if (span) {
      span.innerHTML = newText;
    } else {
      // Ако span липсва, създаваме го (запазвайки resize handle ако има)
      const resizeHandle = bubble.querySelector('div'); // Handle е div
      bubble.innerHTML = `<span>${newText}</span>`;
      if (resizeHandle) bubble.appendChild(resizeHandle);
    }

    // Ако няма текст, може да искаме да скрием балона, или обратно
    if (!newText) {
      bubble.style.display = 'none';
    } else {
      bubble.style.display = 'block';
    }
  }
};

function showStep(stepOrIndex, nextStepIndex = null, single = false) {
  if (stepTimer) clearTimeout(stepTimer);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  let step;
  let stepIndex = -1;
  if (typeof stepOrIndex === 'object') {
    step = stepOrIndex;
  } else {
    stepIndex = stepOrIndex;
    step = activeSteps[stepIndex];
  }
  if (!step) {
    window.removeGuide();
    return;
  }
  // Execute onStart hook
  if (step.onStart && typeof step.onStart === 'function') {
    try {
      step.onStart();
    } catch (e) {
      console.error('Error in step.onStart:', e);
    }
  }
  currentActiveStep = step;
  let isDragging = false; // Moved here to be accessible by startLongPress

  // Handle action: note (Create/Open temporary note)
  if (step.action === 'note') {
    if (typeof window.showModal === 'function') {
      const content = step.noteContent || step.note || "";
      window.showModal({
        raw: content,
        id: 'guide-temp-note',
        color: step.noteColor,
        width: step.noteWidth,
        height: step.noteHeight,
        fontSize: step.noteFontSize
      });
      isTempNoteOpen = true;
    }
  }
  let imagePath = step.image;
  let stopAfter = false;
  if (imagePath && imagePath.endsWith('!')) {
    stopAfter = true;
    imagePath = imagePath.slice(0, -1);
  }
  if (!container || !document.body.contains(container)) {
    container = document.createElement('div');
    container.className = 'guide-container';
    container.style.position = 'fixed'; // По-надеждно за дебъг и позициониране
    container.style.opacity = '0'; // Hide initially
    container.style.zIndex = '10000';
    container.style.pointerEvents = 'none'; // Pass clicks through
    container.style.transition = 'none';
    document.body.appendChild(container);
  } else {
    // Reuse
    container.style.position = 'fixed';
    container.style.transition = 'none';
    container.style.opacity = '0';
  }
  // --- DEBUG OVERLAY ---
  let debugOverlay = document.getElementById('msm-debug-overlay');
  if (!debugOverlay) {
    debugOverlay = document.createElement('div');
    debugOverlay.id = 'msm-debug-overlay';
    debugOverlay.style.position = 'fixed';
    debugOverlay.style.top = '10px';
    debugOverlay.style.left = '10px';
    debugOverlay.style.background = 'rgba(0, 0, 0, 0.7)';
    debugOverlay.style.color = 'white';
    debugOverlay.style.padding = '5px 10px';
    debugOverlay.style.borderRadius = '5px';
    debugOverlay.style.zIndex = '10001';
    debugOverlay.style.pointerEvents = 'auto';
    debugOverlay.style.cursor = 'pointer';
    debugOverlay.style.fontFamily = 'monospace';
    debugOverlay.onclick = () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stepTimer) clearTimeout(stepTimer);
      if (container) {
        container.style.left = '50%';
        container.style.top = '50%';
        container.style.transform = 'translate(-50%, -50%)';
        container.style.position = 'fixed';
        debugOverlay.innerText = "Centered (Auto-update stopped)";
      }
    };
    document.body.appendChild(debugOverlay);
  }
  debugOverlay.innerText = 'Debug info';
  // --- BUBBLE RESIZE LOGIC ---
  let isResizing = false;
  let isBubbleInteracting = false;
  container.innerHTML = ''; // Start clean for each step to re-attach events
  const img = document.createElement('img');
  img.src = imagePath;
  img.className = 'guide-img';
  img.style.cursor = "pointer";
  img.style.pointerEvents = "auto"; // Catch clicks on image
  // Задаване на височина, ако е дефинирана в стъпката
  if (step.height) {
    img.style.height = step.height + 'px';
    img.style.width = 'auto'; // Запазване на пропорциите
  }
  container.appendChild(img);
  // Create Bubble Text elements
  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.style.pointerEvents = "auto"; // Catch clicks on bubble
  // Език на балона (по подразбиране 'en', ако няма в localStorage)
  let currentBubbleLang = localStorage.getItem('language') || 'en';
  // Текстът
  let initialText = '';
  if (step.text) {
    if (typeof step.text === 'object') {
      initialText = step.text[currentBubbleLang] || step.text['en'] || '';
    } else {
      initialText = step.text;
    }
  } else if (typeof guideTexts !== 'undefined' && step.textKey) {
    initialText = (guideTexts[currentBubbleLang] && guideTexts[currentBubbleLang][step.textKey])
      ? guideTexts[currentBubbleLang][step.textKey]
      : (guideTexts['en'] ? guideTexts['en'][step.textKey] : '');
  }
  // Append innerHTML for bubble
  bubble.innerHTML = `<span>${initialText}</span>`;
  if (!initialText) {
    bubble.style.display = 'none';
  }
  container.appendChild(bubble);

  // --- PLAY/RESUME BUTTON (New) ---
  const playBtn = document.createElement('div');
  playBtn.className = 'msm-play-btn';
  playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  playBtn.style.position = 'absolute';
  playBtn.style.top = '-10px'; // Top Right
  playBtn.style.right = '-10px';
  playBtn.style.width = '32px';
  playBtn.style.height = '32px';
  playBtn.style.background = '#ffffff';
  playBtn.style.border = '2px solid #0078d7';
  playBtn.style.borderRadius = '50%';
  playBtn.style.cursor = 'pointer';
  playBtn.style.display = 'none'; // Hidden initially
  playBtn.style.alignItems = 'center';
  playBtn.style.justifyContent = 'center';
  playBtn.style.color = '#0078d7';
  playBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  playBtn.style.zIndex = '100';
  playBtn.title = 'Resume / Next';
  playBtn.style.transition = 'transform 0.2s, background 0.2s';

  playBtn.onmouseenter = () => {
    playBtn.style.transform = 'scale(1.1)';
    playBtn.style.background = '#f0f0f0';
  };
  playBtn.onmouseleave = () => {
    playBtn.style.transform = 'scale(1)';
    playBtn.style.background = '#ffffff';
  };

  // We attach onclick later when nextStep is defined, or define a proxy now
  playBtn.onclick = (e) => {
    e.stopPropagation();
    // wrappedNextStep will be defined below
    if (typeof wrappedNextStep === 'function') wrappedNextStep();
  };

  bubble.appendChild(playBtn);

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.style.width = '15px';
  resizeHandle.style.height = '15px';
  resizeHandle.style.background = 'gray'; // Visible handle
  resizeHandle.style.position = 'absolute';
  resizeHandle.style.bottom = '0';
  resizeHandle.style.right = '0';
  resizeHandle.style.cursor = 'se-resize';
  bubble.appendChild(resizeHandle);
  resizeHandle.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation(); // Спираме влаченето на балона
    if (stepTimer) {
      clearTimeout(stepTimer);
      stepTimer = null;
      // Show resume button
      if (playBtn) playBtn.style.display = 'flex';
    }
    isBubbleInteracting = true;
    isResizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseInt(getComputedStyle(bubble).width, 10);
    const startHeight = parseInt(getComputedStyle(bubble).height, 10);
    let newWidth = startWidth;
    let newHeight = startHeight;
    document.onmousemove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      newWidth = Math.max(50, startWidth + dx); // Min width 50
      newHeight = Math.max(50, startHeight + dy); // Min height 50
      bubble.style.width = newWidth + 'px';
      bubble.style.height = newHeight + 'px';
      debugOverlay.innerText = `Size: w: ${newWidth}, h: ${newHeight} | bx: ${step.bx || 0}, by: ${step.by || 0}`;
    };
    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
      isResizing = false;
      isBubbleInteracting = false;

      const currentBx = step.bx || 0;
      const currentBy = step.by || 0;
      const clipboardText = `x: ${step.x || 0}, y: ${step.y || 0}, bx: ${currentBx}, by: ${currentBy}, bWidth: ${newWidth}, bHeight: ${newHeight}, "target": "${step.target || ''}"`;
      if (!window.isTranslateMode) {
        navigator.clipboard.writeText(clipboardText);
        debugOverlay.innerText = `Copied: ${clipboardText}`;
      }

      step.bWidth = newWidth;
      step.bHeight = newHeight;
    };
  };
  resizeHandle.ontouchstart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (stepTimer) {
      clearTimeout(stepTimer);
      stepTimer = null;
      if (playBtn) playBtn.style.display = 'flex';
    }
    isResizing = true;
    isBubbleInteracting = true;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const startWidth = parseInt(getComputedStyle(bubble).width, 10);
    const startHeight = parseInt(getComputedStyle(bubble).height, 10);
    let newWidth = startWidth;
    let newHeight = startHeight;
    document.ontouchmove = (moveEvent) => {
      const moveTouch = moveEvent.touches[0];
      const dx = moveTouch.clientX - startX;
      const dy = moveTouch.clientY - startY;
      newWidth = Math.max(50, startWidth + dx);
      newHeight = Math.max(50, startHeight + dy);
      bubble.style.width = newWidth + 'px';
      bubble.style.height = newHeight + 'px';
      debugOverlay.innerText = `Size: w: ${newWidth}, h: ${newHeight} | bx: ${step.bx || 0}, by: ${step.by || 0}`;
    };
    document.ontouchend = () => {
      document.ontouchmove = null;
      document.ontouchend = null;
      isResizing = false;
      isBubbleInteracting = false;

      const currentBx = step.bx || 0;
      const currentBy = step.by || 0;
      const clipboardText = `x: ${step.x || 0}, y: ${step.y || 0}, bx: ${currentBx}, by: ${currentBy}, bWidth: ${newWidth}, bHeight: ${newHeight}, "target": "${step.target || ''}"`;
      if (!window.isTranslateMode) {
        navigator.clipboard.writeText(clipboardText);
        debugOverlay.innerText = `Copied: ${clipboardText}`;
      }

      step.bWidth = newWidth;
      step.bHeight = newHeight;
    };
  };
  // --- BUBBLE DRAG LOGIC ---
  let bubbleWasDragged = false;
  bubble.onmousedown = (e) => {
    if (e.target === resizeHandle) return; // Ignore if clicking resize handle
    e.preventDefault();
    e.preventDefault();
    if (stepTimer) {
      clearTimeout(stepTimer);
      stepTimer = null;
      if (playBtn) playBtn.style.display = 'flex';
    }
    isBubbleInteracting = true;
    bubbleWasDragged = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const initialBx = step.bx || 0;
    const initialBy = step.by || 0;
    let finalBx = initialBx;
    let finalBy = initialBy;
    document.onmousemove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        bubbleWasDragged = true;
      }
      if (bubbleWasDragged) {
        finalBx = Math.round(initialBx + dx);
        finalBy = Math.round(initialBy + dy);
        bubble.style.transform = `translate(${finalBx}px, ${finalBy}px)`;
        debugOverlay.innerText = `Bubble: bx: ${finalBx}, by: ${finalBy} | x: ${step.x || 0}, y: ${step.y || 0}`;
      }
    };
    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
      isBubbleInteracting = false;
      if (bubbleWasDragged) {
        // Copy to clipboard
        const currentBWidth = step.bWidth || parseInt(bubble.style.width) || 0;
        const currentBHeight = step.bHeight || parseInt(bubble.style.height) || 0;
        const clipboardText = `x: ${step.x || 0}, y: ${step.y || 0}, bx: ${finalBx}, by: ${finalBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}, "target": "${step.target || ''}"`;
        if (!window.isTranslateMode) {
          navigator.clipboard.writeText(clipboardText);
          debugOverlay.innerText = `Copied: ${clipboardText}`;
        }
        step.bx = finalBx;
        step.by = finalBy;
      } else if (!isResizing) {
        // Handle Click (Language Switch)
        currentBubbleLang = currentBubbleLang === 'en' ? 'bg' : 'en';
        // Обновяваме текста на балона
        let newText = '';
        if (step.text) {
          if (typeof step.text === 'object') {
            newText = step.text[currentBubbleLang] || step.text['en'] || '';
          } else {
            newText = step.text;
          }
        } else if (typeof guideTexts !== 'undefined' && step.textKey) {
          newText = guideTexts[currentBubbleLang] ? guideTexts[currentBubbleLang][step.textKey] : '';
        }
        // Запазваме resize handle ако съществува, но обновяваме текста в span-а
        const span = bubble.querySelector('span');
        if (span) {
          span.innerHTML = newText;
        } else {
          // Fallback ако случайно span липсва
          bubble.innerHTML = `<span>${newText}</span>`;
          if (resizeHandle) bubble.appendChild(resizeHandle);
        }
      }
    };
  };
  // --- BUBBLE TOUCH LOGIC (Added for "Tap -> Next Step") ---
  bubble.ontouchstart = (e) => {
    // Ignore if touching resize handle (it stops propagation anyway, but good to be safe)
    if (e.target === resizeHandle) return;
    e.preventDefault();
    e.preventDefault();
    if (stepTimer) {
      clearTimeout(stepTimer);
      stepTimer = null;
      if (playBtn) playBtn.style.display = 'flex';
    }
    isBubbleInteracting = true; // Use same flag as mouse interaction
    bubbleWasDragged = false;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const initialBx = step.bx || 0;
    const initialBy = step.by || 0;
    let finalBx = initialBx;
    let finalBy = initialBy;
    document.ontouchmove = (moveEvent) => {
      const moveTouch = moveEvent.touches[0];
      const dx = moveTouch.clientX - startX;
      const dy = moveTouch.clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        bubbleWasDragged = true;
      }
      if (bubbleWasDragged) {
        finalBx = Math.round(initialBx + dx);
        finalBy = Math.round(initialBy + dy);
        bubble.style.transform = `translate(${finalBx}px, ${finalBy}px)`;
        debugOverlay.innerText = `Bubble: bx: ${finalBx}, by: ${finalBy} | x: ${step.x || 0}, y: ${step.y || 0}`;
      }
    };
    document.ontouchend = () => {
      document.ontouchmove = null;
      document.ontouchend = null;
      isBubbleInteracting = false;
      if (bubbleWasDragged) {
        // Copy to clipboard
        const currentBWidth = step.bWidth || parseInt(bubble.style.width) || 0;
        const currentBHeight = step.bHeight || parseInt(bubble.style.height) || 0;
        const clipboardText = `x: ${step.x || 0}, y: ${step.y || 0}, bx: ${finalBx}, by: ${finalBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}, "target": "${step.target || ''}"`;
        if (!window.isTranslateMode) {
          navigator.clipboard.writeText(clipboardText);
          debugOverlay.innerText = `Copied: ${clipboardText}`;
        }
        step.bx = finalBx;
        step.by = finalBy;
      } else {
        // Tap on Bubble -> Next Step (Requested Feature)
        wrappedNextStep();
      }
    };
  };
  // Bubble styling and initial positioning
  bubble.style.position = 'absolute';
  // Apply initial dimensions if present
  if (step.bWidth) bubble.style.width = step.bWidth + 'px';
  if (step.bHeight) bubble.style.height = step.bHeight + 'px';
  const bx = step.bx || 0;
  const by = step.by || 0;
  bubble.style.transform = `translate(${bx}px, ${by}px)`;
  const nextStep = () => {
    if (stepTimer) clearTimeout(stepTimer);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    // Ако е single режим или stopAfter, просто затваряме
    if (single || stopAfter) {
      window.removeGuide();
      return;
    }
    // Определяме следващата стъпка
    const nextIndex = nextStepIndex !== null ? nextStepIndex : (stepIndex !== -1 ? stepIndex + 1 : -1);
    if (nextIndex !== -1 && nextIndex < activeSteps.length) {
      showStep(nextIndex);
    } else {
      window.removeGuide();
    }
  };
  img.onclick = nextStep;
  // Добавяме поддръжка за клавиатура (Enter и Space)
  const handleKeyPress = (e) => {
    // Не реагираме, ако потребителят пише в поле за въвеждане
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.removeEventListener('keydown', handleKeyPress);
      nextStep();
    }
  };
  document.addEventListener('keydown', handleKeyPress);
  // Премахваме слушателя при преминаване към следваща стъпка
  const originalNextStep = nextStep;
  const wrappedNextStep = () => {
    document.removeEventListener('keydown', handleKeyPress);
    originalNextStep();
  };
  // Клик на асистента го скрива (преди беше "Следваща стъпка")
  // Клик на асистента: скриване (в режим Превод) или следваща стъпка (в режим Guide)
  const characterClickAction = (e) => {
    if (window.isTranslateMode) {
      if (typeof toggleHero === 'function') window.toggleHero();
      else window.removeGuide();
    } else {
      if (e && e.ctrlKey) {
        window.removeGuide();
      } else {
        wrappedNextStep();
      }
    }
  };
  img.onclick = characterClickAction;

  // Long press logic (for stopping the guide)
  let longPressTimer;
  const longPressDuration = 800; // 800ms for long press

  const startLongPress = (e) => {
    // Only start if not already dragging
    if (isDragging) return;

    longPressTimer = setTimeout(() => {
      window.removeGuide();
      // Vibrating feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
    }, longPressDuration);
  };

  const endLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  img.addEventListener('mousedown', startLongPress);
  img.addEventListener('mouseup', endLongPress);
  img.addEventListener('mouseleave', endLongPress);

  img.addEventListener('touchstart', startLongPress, { passive: true });
  img.addEventListener('touchend', endLongPress);
  img.addEventListener('touchcancel', endLongPress);
  img.addEventListener('touchmove', endLongPress, { passive: true });

  // Автоматично преминаване след 10 секунди (само ако не е single режим)
  if (!single) {
    stepTimer = setTimeout(wrappedNextStep, stepTime);
  }
  // Позициониране спрямо елемент
  let targetEl = document.querySelector(step.target);
  let scrollDelay = 0;
  if (targetEl) {
    // Scroll element into view if needed
    if (targetEl !== document.body && targetEl !== document.documentElement) {
      const rect = targetEl.getBoundingClientRect();
      const isVisible = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
      if (!isVisible) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        scrollDelay = 600;
      }
    }
  } else {
    targetEl = document.body;
  }
  if (targetEl) {
    // let isDragging = false; // Moved to top of function
    // Функция за непрекъснато обновяване на позицията
    const updatePosition = () => {
      // Update Loop
      if (!img.complete) {
        animationFrameId = requestAnimationFrame(updatePosition);
        return;
      }
      // Removed strict offsetParent check to avoid deadlock

      // Ако влачим или сме в режим на превод, не обновяваме автоматично, за да не пречим на потребителя
      if (!isDragging && !isBubbleInteracting && !isResizing && !window.isTranslateMode) {
        const imgOffsetLeft = img.offsetLeft;
        const imgOffsetTop = img.offsetTop;
        const rect = targetEl.getBoundingClientRect();

        // Check if target has 0 dimensions (hidden), unless it's body/html
        const isBodyOrHtml = targetEl.tagName === 'BODY' || targetEl.tagName === 'HTML';
        if (!isBodyOrHtml && rect.width === 0 && rect.height === 0) {
          // Fallback: If target is hidden, center on screen but don't flood the console
          if (container.style.left !== "50%") {
            container.style.left = "50%";
            container.style.top = "50%";
            container.style.transform = "translate(-50%, -50%)";
            container.style.opacity = '1';
          }
          animationFrameId = requestAnimationFrame(updatePosition);
          return;
        }

        // Reset transform if it was centered
        container.style.transform = 'none';

        // Since container is now position: fixed, we use viewport coordinates directly
        // without adding window.scrollX/Y
        container.style.left = (rect.left + step.x - imgOffsetLeft) + "px";
        container.style.top = (rect.top + step.y - imgOffsetTop) + "px";

        // Show container
        if (container.style.opacity === '0') {
          container.style.transition = 'opacity 0.3s ease';
          container.style.opacity = '1';
          console.log(`[MSM] Assistant visible at ${container.style.left}, ${container.style.top}`);
        }
        // Boundary Check for Bubble
        const vpW = window.visualViewport ? window.visualViewport.width : (window.innerWidth || document.documentElement.clientWidth);
        const vpH = window.visualViewport ? window.visualViewport.height : (window.innerHeight || document.documentElement.clientHeight);
        let curBx = step.bx || 0;
        let curBy = step.by || 0;
        const cRect = container.getBoundingClientRect();
        // Calculate the theoretical absolute position of the bubble based on step params
        const baseLeft = cRect.left + curBx;
        const baseTop = cRect.top + curBy;
        const bW = bubble.offsetWidth;
        const bH = bubble.offsetHeight;
        const baseRight = baseLeft + bW;
        const baseBottom = baseTop + bH;
        let corrX = 0;
        let corrY = 0;
        const padding = 3;
        // Check horizontal
        if (baseLeft < padding) {
          corrX = -baseLeft + padding;
        }
        // Check vertical
        if (baseTop < padding) {
          corrY = -baseTop + padding;
        } else if (baseBottom > vpH - padding) {
          corrY = (vpH - padding) - baseBottom;
        }
        // Apply transform
        if (corrX !== 0 || corrY !== 0) {
          bubble.style.transform = `translate(${curBx + corrX}px, ${curBy + corrY}px)`;
        } else {
          // Reset to original if no correction needed
          bubble.style.transform = `translate(${curBx}px, ${curBy}px)`;
        }
      }
      animationFrameId = requestAnimationFrame(updatePosition);
    };
    // Изчакваме картинката да се зареди, за да имаме коректни размери (offsetLeft/Top)
    const startPositioning = () => {
      if (scrollDelay > 0) {
        setTimeout(updatePosition, scrollDelay);
      } else {
        updatePosition();
      }
    };
    if (img.complete) {
      startPositioning();
    } else {
      img.onload = startPositioning;
    }
    // --- DRAG LOGIC FOR DEBUGGING (IMAGE/CONTAINER) ---
    let startX, startY, initialLeft, initialTop;
    let finalRelX = 0;
    let finalRelY = 0;
    let wasDragged = false;
    img.onmousedown = (e) => {
      e.preventDefault();
      if (stepTimer) {
        clearTimeout(stepTimer);
        stepTimer = null;
        if (playBtn) playBtn.style.display = 'flex';
      }
      isDragging = true; // Спираме автоматичното позициониране
      wasDragged = false;
      startX = e.clientX;
      startY = e.clientY;
      if (!container) return;
      // Fix for drag after centering (remove transform and set absolute px)
      const rect = container.getBoundingClientRect();
      container.style.transform = 'none';
      container.style.left = rect.left + 'px';
      container.style.top = rect.top + 'px';
      container.style.position = 'fixed'; // Ensure fixed if it was centered
      initialLeft = rect.left;
      initialTop = rect.top;
      let lastIdentifiedEl = null;
      document.onmousemove = (moveEvent) => {
        if (!container) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        // КОРЕКЦИЯ: Изчистваме таймера за дълго натискане веднага при движение,
        // дори и да е малко, за да не изчезва асистента при бавно влачене.
        if (longPressTimer && (dx !== 0 || dy !== 0)) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }

        // Отчитаме влачене (за логиката на асистента) само ако има движение над 10 пиксела
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          wasDragged = true;
        }
        if (wasDragged) {
          container.style.left = initialLeft + dx + "px";
          container.style.top = initialTop + dy + "px";
          // Identify element based on image direction
          const currentImgRect = img.getBoundingClientRect();
          let pX = currentImgRect.right - 10; // Default (r-up/down)
          if (img.src && (img.src.includes('l-up') || img.src.includes('l-down'))) {
            pX = currentImgRect.left;
          }
          let pY = currentImgRect.top + 10; // Default (up)
          if (img.src && (img.src.includes('l-down') || img.src.includes('r-down'))) {
            pY = currentImgRect.bottom - 10;
          }
          container.style.visibility = 'hidden';
          let elAtPoint = document.elementFromPoint(pX, pY);
          // Ignore hidden elements (rect width/height 0)
          if (elAtPoint) {
            const r = elAtPoint.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) elAtPoint = null;
          }
          lastIdentifiedEl = elAtPoint;
          container.style.visibility = 'visible';
          let elId = '';
          const currentImgRectForCalc = img.getBoundingClientRect();
          let currentTargetRectForCalc = targetEl.getBoundingClientRect(); // Default
          if (lastIdentifiedEl) {
            elId = lastIdentifiedEl.id ? '#' + lastIdentifiedEl.id : lastIdentifiedEl.tagName.toLowerCase();
            if (lastIdentifiedEl.className && typeof lastIdentifiedEl.className === 'string') {
              const classes = lastIdentifiedEl.className.split(' ').filter(c => c !== 'kb-highlight'); // Filter out highlight class
              if (classes.length > 0 && !lastIdentifiedEl.id) elId += '.' + classes[0];
            }
            // Use the new element's rect for calculation
            currentTargetRectForCalc = lastIdentifiedEl.getBoundingClientRect();
          }
          finalRelX = Math.round(currentImgRectForCalc.left - currentTargetRectForCalc.left);
          finalRelY = Math.round(currentImgRectForCalc.top - currentTargetRectForCalc.top);
          debugOverlay.innerText = `Target: ${elId || 'None'} | x: ${finalRelX}, y: ${finalRelY}`;

          // --- TRANSLATE MODE LOGIC ---
          if (window.isTranslateMode) {
            const trKeyEl = document.getElementById('msm-tr-key');
            const trValEl = document.getElementById('msm-tr-val');
            if (trKeyEl && trValEl && lastIdentifiedEl) {
              // Position the overlay dynamically based on assistant position
              if (typeof window.updateTranslateOverlayPosition === 'function') {
                window.updateTranslateOverlayPosition(pY);
              }
              const trEl = lastIdentifiedEl.closest('[data-key], [data-key-placeholder], [data-key-title]');
              const dataKey = trEl ? (trEl.getAttribute('data-key') ||
                trEl.getAttribute('data-key-placeholder') ||
                trEl.getAttribute('data-key-title')) : null;
              if (trEl) lastIdentifiedEl = trEl; // Use the closest translatable parent
              if (dataKey) {
                // ... (trKeyEl.innerText update moved down)
                const lang = window.currentLang || localStorage.getItem('language') || 'en';
                const allTranslations = typeof appTranslations !== 'undefined' ? appTranslations : window.appTranslations;
                const translations = (allTranslations && allTranslations[lang]) ? allTranslations[lang] : allTranslations;

                // console.log(`[MSM-TR] Lang: ${lang}, Key: ${dataKey}`);
                // console.log(`[MSM-TR] appTranslations:`, allTranslations);
                // console.log(`[MSM-TR] Resolved translations (lang: ${lang}):`, translations);

                let val = '';
                if (translations) {
                  if (translations[dataKey]) {
                    val = translations[dataKey];
                  } else {
                    // Case-insensitive fallback
                    const lowerKey = dataKey.toLowerCase();
                    const exactKey = Object.keys(translations).find(k => k.toLowerCase() === lowerKey);
                    if (exactKey) val = translations[exactKey];
                  }
                }
                // console.log(`[MSM-TR] Found value: "${val}"`);

                const isNewKey = trKeyEl.innerText !== dataKey;

                if (isNewKey || (trValEl.value !== val && !trValEl.matches(':focus'))) {
                  trValEl.value = val;
                  if (typeof window.syncMsmTranslateHeight === 'function') window.syncMsmTranslateHeight();
                  // Сохраняем оригинал для отмены, если это новый ключ
                  if (isNewKey) {
                    currentOriginalTranslation = { key: dataKey, value: val };
                    const undoBtn = document.getElementById('msm-tr-undo');
                    const applyBtn = document.getElementById('msm-tr-apply');
                    if (undoBtn) undoBtn.style.display = 'none';
                    if (applyBtn) applyBtn.style.display = 'block';
                  }
                }
                trKeyEl.innerText = dataKey;
                trKeyEl.style.color = '#00ff00';
                trKeyEl.style.background = 'rgba(0,255,0,0.1)';
              } else {
                // FALLBACK for elements without data-key
                trKeyEl.innerText = 'No data-key';
                trKeyEl.style.color = '#ffaa00';
                trKeyEl.style.background = 'rgba(255,170,0,0.1)';

                const val = (lastIdentifiedEl.children.length === 0 ? (lastIdentifiedEl.innerText || lastIdentifiedEl.textContent || '').trim() : Array.from(lastIdentifiedEl.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(s => s).join(' ')) || lastIdentifiedEl.placeholder || lastIdentifiedEl.title || '';
                if (trValEl.value !== val && !trValEl.matches(':focus')) {
                  trValEl.value = val;
                }
              }
            }
          }
        }
      };
      document.onmouseup = () => {
        // Ensure visibility is restored
        if (container) container.style.visibility = 'visible';
        document.onmousemove = null;
        document.onmouseup = null;
        isDragging = false; // Разрешаваме отново автоматичното позициониране
        if (wasDragged) {
          // Use lastIdentifiedEl found during drag instead of recalculating
          const currentImgRect = img.getBoundingClientRect();
          const el = lastIdentifiedEl;
          let elId = '';
          let currentTargetRectForCalc = targetEl.getBoundingClientRect(); // Default
          if (el) {
            elId = el.id ? '#' + el.id : el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c !== 'kb-highlight');
              if (classes.length > 0 && !el.id) elId += '.' + classes[0];
            }
            // Use the new element's rect for calculation
            currentTargetRectForCalc = el.getBoundingClientRect();
          }
          const isGeneric = !el || el.tagName === 'BODY' || el.tagName === 'HTML';
          if (!isGeneric) {
            finalRelX = Math.round(currentImgRect.left - currentTargetRectForCalc.left);
            finalRelY = Math.round(currentImgRect.top - currentTargetRectForCalc.top);
            step.x = finalRelX;
            step.y = finalRelY;
            if (elId && elId !== step.target) {
              step.target = elId;
              const newTarget = document.querySelector(elId);
              if (newTarget) targetEl = newTarget;
            }
            const currentBx = step.bx || 0;
            const currentBy = step.by || 0;
            const currentBWidth = step.bWidth || 0;
            const currentBHeight = step.bHeight || 0;
            const clipboardText = `x: ${finalRelX}, y: ${finalRelY}, bx: ${currentBx}, by: ${currentBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}, "target": "${elId}"`;
            if (!window.isTranslateMode) {
              navigator.clipboard.writeText(clipboardText);
              debugOverlay.innerText = `Copied: ${clipboardText}`;
            }
          } else {
            debugOverlay.innerText = `Reverted (Target: ${elId || 'None'})`;
          }
          // Reset click handler
          img.onclick = null;
          setTimeout(() => { img.onclick = characterClickAction; }, 100);
        }
      };
    };
    // Touch support for image drag
    img.ontouchstart = (e) => {
      e.preventDefault();
      if (stepTimer) {
        clearTimeout(stepTimer);
        stepTimer = null;
        if (playBtn) playBtn.style.display = 'flex';
      }
      isDragging = true;
      wasDragged = false;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      container.style.transform = 'none';
      container.style.left = rect.left + 'px';
      container.style.top = rect.top + 'px';
      container.style.position = 'fixed'; // Ensure fixed if it was centered
      initialLeft = rect.left;
      initialTop = rect.top;
      let lastIdentifiedEl = null;
      document.ontouchmove = (moveEvent) => {
        const moveTouch = moveEvent.touches[0];
        const dx = moveTouch.clientX - startX;
        const dy = moveTouch.clientY - startY;

        // КОРЕКЦИЯ: Изчистваме таймера веднага при тъч движение
        if (longPressTimer && (dx !== 0 || dy !== 0)) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }

        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          wasDragged = true;
        }
        if (wasDragged) {
          container.style.left = initialLeft + dx + "px";
          container.style.top = initialTop + dy + "px";
          // Identify element (update lastIdentifiedEl)
          const currentImgRect = img.getBoundingClientRect();
          let pX = currentImgRect.right - 10; // Default (r-up)
          if (img.src && (img.src.includes('l-up') || img.src.includes('l-down'))) {
            pX = currentImgRect.left;
          }
          let pY = currentImgRect.top + 10; // Default (up)
          if (img.src && (img.src.includes('l-down') || img.src.includes('r-down'))) {
            pY = currentImgRect.bottom - 10;
          }
          container.style.visibility = 'hidden';
          let elAtPoint = document.elementFromPoint(pX, pY);
          // Ignore hidden elements
          if (elAtPoint) {
            const r = elAtPoint.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) elAtPoint = null;
          }
          lastIdentifiedEl = elAtPoint;
          container.style.visibility = 'visible';
          if (lastIdentifiedEl) {
            const el = lastIdentifiedEl;
            let elId = el.id ? '#' + el.id : el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c !== 'kb-highlight');
              if (classes.length > 0 && !el.id) elId += '.' + classes[0];
            }
            const currentImgRectForCalc = img.getBoundingClientRect();
            const currentTargetRectForCalc = el.getBoundingClientRect();
            const finalRelX = Math.round(currentImgRectForCalc.left - currentTargetRectForCalc.left);
            const finalRelY = Math.round(currentImgRectForCalc.top - currentTargetRectForCalc.top);
            const debugOverlay = document.getElementById('msm-debug-overlay');
            if (debugOverlay) debugOverlay.innerText = `Target: ${elId || 'None'} | x: ${finalRelX}, y: ${finalRelY}`;

            // --- TRANSLATE MODE LOGIC (TOUCH) ---
            if (window.isTranslateMode) {
              const trKeyEl = document.getElementById('msm-tr-key');
              const trValEl = document.getElementById('msm-tr-val');
              if (trKeyEl && trValEl) {
                // Dynamic position for touch
                if (typeof window.updateTranslateOverlayPosition === 'function') {
                  window.updateTranslateOverlayPosition(pY);
                }
                const trEl = el.closest('[data-key], [data-key-placeholder], [data-key-title]');
                const dataKey = trEl ? (trEl.getAttribute('data-key') ||
                  trEl.getAttribute('data-key-placeholder') ||
                  trEl.getAttribute('data-key-title')) : null;
                if (trEl) {
                  el = trEl;
                  lastIdentifiedEl = trEl; // Ensure mouseup also uses this
                }
                if (dataKey) {
                  trKeyEl.innerText = dataKey;
                  const lang = window.currentLang || localStorage.getItem('language') || 'en';
                  const allTranslations = typeof appTranslations !== 'undefined' ? appTranslations : window.appTranslations;
                  const translations = (allTranslations && allTranslations[lang]) ? allTranslations[lang] : allTranslations;

                  let val = '';
                  if (translations) {
                    if (translations[dataKey]) {
                      val = translations[dataKey];
                    } else {
                      // Case-insensitive fallback
                      const lowerKey = dataKey.toLowerCase();
                      const exactKey = Object.keys(translations).find(k => k.toLowerCase() === lowerKey);
                      if (exactKey) val = translations[exactKey];
                    }
                  }

                  const isNewKey = trKeyEl.innerText !== dataKey;

                  if (isNewKey || (trValEl.value !== val && !trValEl.matches(':focus'))) {
                    trValEl.value = val;
                    if (typeof window.syncMsmTranslateHeight === 'function') window.syncMsmTranslateHeight();
                    // Сохраняем оригинал для отмены, если это новый ключ (touch)
                    if (isNewKey) {
                      currentOriginalTranslation = { key: dataKey, value: val };
                      const undoBtn = document.getElementById('msm-tr-undo');
                      const applyBtn = document.getElementById('msm-tr-apply');
                      if (undoBtn) undoBtn.style.display = 'none';
                      if (applyBtn) applyBtn.style.display = 'block';
                    }
                  }
                  trKeyEl.innerText = dataKey;
                  trKeyEl.style.color = '#00ff00';
                  trKeyEl.style.background = 'rgba(0,255,0,0.1)';
                } else {
                  // Fallback for touch
                  trKeyEl.innerText = 'No data-key';
                  trKeyEl.style.color = '#ffaa00';
                  trKeyEl.style.background = 'rgba(255,170,0,0.1)';
                  const val = (el.children.length === 0 ? (el.innerText || el.textContent || '').trim() : Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(s => s).join(' ')) || el.placeholder || el.title || '';
                  if (trValEl.value !== val && !trValEl.matches(':focus')) {
                    trValEl.value = val;
                  }
                }
              }
            }
          }
        }
      };
      document.ontouchend = () => {
        // Ensure visibility is restored
        if (container) container.style.visibility = 'visible';
        document.ontouchmove = null;
        document.ontouchend = null;
        isDragging = false;
        if (wasDragged) {
          // Use lastIdentifiedEl instead of recalculating
          const currentImgRect = img.getBoundingClientRect();
          const el = lastIdentifiedEl;
          let elId = '';
          let currentTargetRectForCalc = targetEl.getBoundingClientRect(); // Default
          if (el) {
            elId = el.id ? '#' + el.id : el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c !== 'kb-highlight');
              if (classes.length > 0 && !el.id) elId += '.' + classes[0];
            }
            // Use the new element's rect for calculation
            currentTargetRectForCalc = el.getBoundingClientRect();
          }
          const isGeneric = !el || el.tagName === 'BODY' || el.tagName === 'HTML';
          if (!isGeneric) {
            finalRelX = Math.round(currentImgRect.left - currentTargetRectForCalc.left);
            finalRelY = Math.round(currentImgRect.top - currentTargetRectForCalc.top);
            step.x = finalRelX;
            step.y = finalRelY;
            if (elId && elId !== step.target) {
              step.target = elId;
              const newTarget = document.querySelector(elId);
              if (newTarget) targetEl = newTarget;
            }
            const currentBx = step.bx || 0;
            const currentBy = step.by || 0;
            const currentBWidth = step.bWidth || 0;
            const currentBHeight = step.bHeight || 0;
            const clipboardText = `x: ${finalRelX}, y: ${finalRelY}, bx: ${currentBx}, by: ${currentBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}, "target": "${elId}"`;
            if (!window.isTranslateMode) {
              navigator.clipboard.writeText(clipboardText);
              debugOverlay.innerText = `Copied: ${clipboardText}`;
            }
          } else {
            debugOverlay.innerText = `Reverted (Target: ${elId || 'None'})`;
          }
          // Reset click handler
          img.onclick = null;
          setTimeout(() => { img.onclick = characterClickAction; }, 100);
        } else {
          characterClickAction();
        }
      };
    };
  }
}
// Стартиране при клик върху заглавието или ако променливата msm е true
document.addEventListener('DOMContentLoaded', () => {
  const appTitle = document.querySelector('h1[data-key="appTitle"]');
  if (appTitle) {
    appTitle.style.cursor = 'pointer';
    appTitle.style.userSelect = 'none'; // Предотвратява избор на текст
    appTitle.style.webkitUserSelect = 'none'; // За Safari
    let clickTimer = null;
    // Single click - start guide
    appTitle.addEventListener('click', () => {
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        showStep(0);
        clickTimer = null;
      }, 300);
    });
    // Double click - center guide on screen
    const handleDoubleClick = (e) => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      e.preventDefault(); // Предотвратява избор на текст
      if (container && document.body.contains(container)) {
        // Спираме автоматичното позициониране
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        // Скриваме контейнера временно
        container.style.visibility = 'hidden';
        // Изчисляваме центъра на екрана
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const containerRect = container.getBoundingClientRect();
        const centerX = (viewportWidth - containerRect.width) / 2;
        const centerY = (viewportHeight - containerRect.height) / 2;
        // Позиционираме контейнера в центъра
        container.style.left = centerX + window.scrollX + 'px';
        container.style.top = centerY + window.scrollY + 'px';
        // Показваме контейнера отново
        container.style.visibility = 'visible';
      }
    };
    appTitle.addEventListener('dblclick', handleDoubleClick);
    // Double tap detection for mobile
    let lastTap = 0;
    appTitle.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      if (tapLength < 500 && tapLength > 0) {
        handleDoubleClick(e);
      }
      lastTap = currentTime;
    });
  }

  // --- AUTO-START LOGIC (Outside appTitle check) ---
  // Check both window property and local variable for msm/debug
  const shouldStart = (typeof msm !== 'undefined' && msm) ||
    (window.msm) ||
    (typeof debug !== 'undefined' && debug) ||
    (window.debug);

  if (shouldStart) {
    console.log("[MSM] Auto-start triggered (debug/msm flag found)");
    // Изчакваме малко, за да се заредят шрифтове, стилове и DOM елементи
    setTimeout(() => {
      if (typeof toggleHero === 'function') {
        // Използваме toggleHero, за да задействаме debug режима (буболечката)
        toggleHero();
      }
    }, 1200);
  }
});
