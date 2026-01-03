let container;
let stepTimer;
let currentActiveStep = null;
let stepTime = 10000;
let animationFrameId; // defined in msmguide.js but let's be safe
let activeSteps = typeof steps !== 'undefined' ? steps : [];

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
    let dbg = document.getElementById('msm-debug-overlay');
    if (dbg) dbg.remove();
    if (stepTimer) clearTimeout(stepTimer);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    return false;
  } else {
    if (activeSteps.length === 0) {
      // Default debug step
      const debugStep = {
        image: 'msm/msm-show.png',
        text: { bg: 'Здравей! Аз съм твоят асистент в Debug режим. 🐛', en: 'Hello! I am your assistant in Debug mode. 🐛' },
        x: window.innerWidth / 2 - 50, // Center roughly
        y: window.innerHeight / 2 - 100,
        target: 'html',
        bx: 0, by: 120,
        bWidth: 220, bHeight: 100
      };
      showStep(debugStep);
    } else {
      showStep(0);
    }
    return true;
  }
};

// Make showStep globally available for internal use (if needed) but showGuideStep is preferred for single steps
window.showStep = showStep;

// Expose removeGuide for external control (e.g. from KB Assistant)
window.removeGuide = function () {
  if (container) {
    container.remove();
    container = null;
  }
  let dbg = document.getElementById('msm-debug-overlay');
  if (dbg) dbg.remove();
  if (stepTimer) clearTimeout(stepTimer);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
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
  if (!step) return;
  // Execute onStart hook
  if (step.onStart && typeof step.onStart === 'function') {
    try {
      step.onStart();
    } catch (e) {
      console.error('Error in step.onStart:', e);
    }
  }
  currentActiveStep = step;
  let imagePath = step.image;
  let stopAfter = false;
  if (imagePath && imagePath.endsWith('!')) {
    stopAfter = true;
    imagePath = imagePath.slice(0, -1);
  }
  if (!container || !document.body.contains(container)) {
    container = document.createElement('div');
    container.className = 'guide-container';
    container.style.position = 'absolute';
    container.style.opacity = '0'; // Hide initially
    container.style.zIndex = '10000';
    container.style.pointerEvents = 'none'; // Pass clicks through
    document.body.appendChild(container);
  } else {
    // Reuse
    container.style.opacity = '0';
    container.style.left = '0px';
    container.style.top = '0px';
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
  // if (!initialText) {
  //   bubble.style.display = 'none';
  // }
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
      debugOverlay.innerText = `Size: w: ${newWidth}, h: ${newHeight}`;
    };
    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
      isResizing = false;
      isBubbleInteracting = false;
      // Copy to clipboard
      const currentBx = step.bx || 0;
      const currentBy = step.by || 0;
      const clipboardText = `bx: ${currentBx}, by: ${currentBy}, bWidth: ${newWidth}, bHeight: ${newHeight}`;
      navigator.clipboard.writeText(clipboardText);
      debugOverlay.innerText = `Copied: ${clipboardText}`;
      // Update step object (optional, for current session)
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
      debugOverlay.innerText = `Size: w: ${newWidth}, h: ${newHeight}`;
    };
    document.ontouchend = () => {
      document.ontouchmove = null;
      document.ontouchend = null;
      isResizing = false;
      isBubbleInteracting = false;
      const currentBx = step.bx || 0;
      const currentBy = step.by || 0;
      const clipboardText = `bx: ${currentBx}, by: ${currentBy}, bWidth: ${newWidth}, bHeight: ${newHeight}`;
      navigator.clipboard.writeText(clipboardText);
      debugOverlay.innerText = `Copied: ${clipboardText}`;
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
        debugOverlay.innerText = `Bubble: bx: ${finalBx}, by: ${finalBy}`;
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
        const clipboardText = `bx: ${finalBx}, by: ${finalBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}`;
        navigator.clipboard.writeText(clipboardText);
        debugOverlay.innerText = `Copied: ${clipboardText}`;
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
        debugOverlay.innerText = `Bubble: bx: ${finalBx}, by: ${finalBy}`;
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
        const clipboardText = `bx: ${finalBx}, by: ${finalBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}`;
        navigator.clipboard.writeText(clipboardText);
        debugOverlay.innerText = `Copied: ${clipboardText}`;
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
      if (container) container.remove();
      container = null;
      if (debugOverlay) debugOverlay.remove();
      return;
    }
    // Определяме следващата стъпка
    const nextIndex = nextStepIndex !== null ? nextStepIndex : (stepIndex !== -1 ? stepIndex + 1 : -1);
    if (nextIndex !== -1 && nextIndex < activeSteps.length) {
      showStep(nextIndex);
    } else {
      if (container) container.remove();
      container = null;
      if (debugOverlay) debugOverlay.remove(); // Remove debug overlay when guide ends
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
  // Заменяме nextStep с обвитата версия
  // Заменяме nextStep с обвитата версия (Support Ctrl+Click to stop)
  img.onclick = (e) => {
    if (e.ctrlKey) {
      window.removeGuide();
    } else {
      wrappedNextStep();
    }
  };

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
    let isDragging = false;
    // Функция за непрекъснато обновяване на позицията
    const updatePosition = () => {
      // Update Loop
      if (!img.complete) {
        animationFrameId = requestAnimationFrame(updatePosition);
        return;
      }
      // Removed strict offsetParent check to avoid deadlock

      // Ако влачим, не обновяваме автоматично, за да не пречим на потребителя
      if (!isDragging && !isBubbleInteracting && !isResizing) {
        const imgOffsetLeft = img.offsetLeft;
        const imgOffsetTop = img.offsetTop;
        const rect = targetEl.getBoundingClientRect();

        // Check if target has 0 dimensions (hidden), unless it's body/html
        const isBodyOrHtml = targetEl.tagName === 'BODY' || targetEl.tagName === 'HTML';
        if (!isBodyOrHtml && rect.width === 0 && rect.height === 0) {
          container.style.opacity = '0';
          animationFrameId = requestAnimationFrame(updatePosition);
          return;
        }

        container.style.left = (rect.left + window.scrollX + step.x - imgOffsetLeft) + "px";
        container.style.top = (rect.top + window.scrollY + step.y - imgOffsetTop) + "px";

        // Show container
        if (container.style.opacity === '0') {
          container.style.transition = 'opacity 0.3s ease';
          container.style.opacity = '1';
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
        // Отчитаме влачене само ако има движение над 10 пиксела
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
          lastIdentifiedEl = document.elementFromPoint(pX, pY);
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
        }
      };
      document.onmouseup = () => {
        // Ensure visibility is restored
        container.style.visibility = 'visible';
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
            navigator.clipboard.writeText(clipboardText);
            debugOverlay.innerText = `Copied: ${clipboardText}`;
          } else {
            debugOverlay.innerText = `Reverted (Target: ${elId || 'None'})`;
          }
          // Reset click handler
          img.onclick = null;
          setTimeout(() => { img.onclick = wrappedNextStep; }, 100);
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
          lastIdentifiedEl = document.elementFromPoint(pX, pY);
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
          }
        }
      };
      document.ontouchend = () => {
        // Ensure visibility is restored
        container.style.visibility = 'visible';
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
            navigator.clipboard.writeText(clipboardText);
            debugOverlay.innerText = `Copied: ${clipboardText}`;
          } else {
            debugOverlay.innerText = `Reverted (Target: ${elId || 'None'})`;
          }
          // Reset click handler
          img.onclick = null;
          setTimeout(() => { img.onclick = wrappedNextStep; }, 100);
        } else {
          wrappedNextStep();
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
    // Auto-start if configured
    if (typeof msm !== 'undefined' && msm) {
      // Изчакваме малко, за да се заредят шрифтове и стилове
      setTimeout(() => {
        showStep(0);
      }, 1000);
    }
  }
});

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
