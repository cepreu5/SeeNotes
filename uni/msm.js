let container;
let stepTimer;
let currentActiveStep = null;
let stepTime = 50000;
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

// Make showStep globally available for internal use (if needed) but showGuideStep is preferred for single steps
window.showStep = showStep;

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
  currentActiveStep = step;

  let imagePath = step.image;
  let stopAfter = false;
  if (imagePath && imagePath.endsWith('!')) {
    stopAfter = true;
    imagePath = imagePath.slice(0, -1);
  }

  if (!container || !document.body.contains(container)) {
    container = document.createElement("div");
    container.className = "guide-container";
    container.style.visibility = 'hidden'; // Скриваме първоначално
    document.body.appendChild(container);
  } else {
    container.innerHTML = "";
    container.style.visibility = 'hidden'; // Скриваме при смяна на стъпка
  }

  const bubble = document.createElement("div");
  bubble.className = "speech-bubble";

  // Получаваме текста на текущия език
  let currentBubbleLang = getCurrentLanguage();
  let stepText;
  if (step.text) {
    if (typeof step.text === 'object') {
      stepText = step.text[currentBubbleLang] || step.text['en'] || '';
    } else {
      stepText = step.text;
    }
  } else {
    stepText = guideTexts[currentBubbleLang][step.textKey];
  }
  bubble.innerHTML = `<span>${stepText}</span>`;

  // Прилагаме относителни координати за балона
  const bx = step.bx || 0;
  const by = step.by || 0;
  bubble.style.transform = `translate(${bx}px, ${by}px)`;
  bubble.style.cursor = "grab";

  // Прилагаме размери, ако са зададени
  if (step.bWidth) bubble.style.width = step.bWidth + 'px';
  if (step.bHeight) bubble.style.height = step.bHeight + 'px';

  // --- RESIZE HANDLE ---
  const resizeHandle = document.createElement('div');
  resizeHandle.style.position = 'absolute';
  resizeHandle.style.bottom = '0';
  resizeHandle.style.right = '0';
  resizeHandle.style.width = '20px';
  resizeHandle.style.height = '20px';
  resizeHandle.style.cursor = 'se-resize';
  resizeHandle.style.zIndex = '10';
  // resizeHandle.style.background = 'rgba(255, 0, 0, 0.3)'; // For debugging
  bubble.appendChild(resizeHandle);

  container.appendChild(bubble);

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
    debugOverlay.style.pointerEvents = 'none';
    debugOverlay.style.fontFamily = 'monospace';
    document.body.appendChild(debugOverlay);
  }
  debugOverlay.innerText = 'Debug info';



  // --- BUBBLE RESIZE LOGIC ---
  let isResizing = false;

  resizeHandle.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation(); // Спираме влаченето на балона
    if (stepTimer) clearTimeout(stepTimer);

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
    if (stepTimer) clearTimeout(stepTimer);

    isResizing = true;
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

  bubble.onclick = (e) => {
    // Ако балонът не е бил влачен и не се преоразмерява, превключваме езика
    if (!bubbleWasDragged && !isResizing) {
      e.preventDefault();
      e.stopPropagation();

      currentBubbleLang = currentBubbleLang === 'en' ? 'bg' : 'en';

      // Обновяваме текста на балона
      let newText;
      if (step.text) {
        if (typeof step.text === 'object') {
          newText = step.text[currentBubbleLang] || step.text['en'] || '';
        } else {
          newText = step.text;
        }
      } else {
        newText = guideTexts[currentBubbleLang][step.textKey];
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
    bubbleWasDragged = false;
  };

  bubble.onmousedown = (e) => {
    if (e.target === resizeHandle) return; // Ignore if clicking resize handle
    e.preventDefault();
    if (stepTimer) clearTimeout(stepTimer);

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

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
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

      if (bubbleWasDragged) {
        // Copy to clipboard
        const currentBWidth = step.bWidth || parseInt(bubble.style.width) || 0;
        const currentBHeight = step.bHeight || parseInt(bubble.style.height) || 0;
        const clipboardText = `bx: ${finalBx}, by: ${finalBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}`;
        navigator.clipboard.writeText(clipboardText);
        debugOverlay.innerText = `Copied: ${clipboardText}`;

        step.bx = finalBx;
        step.by = finalBy;
      }
    };
  };

  // Touch support for bubble drag
  bubble.ontouchstart = (e) => {
    if (e.target === resizeHandle) return;
    e.preventDefault();
    if (stepTimer) clearTimeout(stepTimer);

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

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
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
        // Ако не е имало влачене, превключваме езика
        // Note: onclick handles this for mouse, but for touch we might want to ensure it works too.
        // However, onclick usually fires after touchend if not prevented.
        // But we preventedDefault in touchstart? Yes. So click won't fire.
        // We must manually trigger language switch or simulate click behavior here.

        currentBubbleLang = currentBubbleLang === 'en' ? 'bg' : 'en';

        let newText;
        if (step.text) {
          if (typeof step.text === 'object') {
            newText = step.text[currentBubbleLang] || step.text['en'] || '';
          } else {
            newText = step.text;
          }
        } else {
          newText = guideTexts[currentBubbleLang][step.textKey];
        }

        const span = bubble.querySelector('span');
        if (span) {
          span.innerHTML = newText;
        } else {
          bubble.innerHTML = `<span>${newText}</span>`;
          if (resizeHandle) bubble.appendChild(resizeHandle);
        }
      }
    };
  };

  const img = document.createElement("img");
  img.src = imagePath;
  img.className = "guide-img";
  img.style.cursor = "pointer";

  // Задаване на височина, ако е дефинирана в стъпката
  if (step.height) {
    img.style.height = step.height + 'px';
    img.style.width = 'auto'; // Запазване на пропорциите
  }

  container.appendChild(img);

  const nextStep = () => {
    if (stepTimer) clearTimeout(stepTimer);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Ако е single режим или stopAfter, просто затваряме
    if (single || stopAfter) {
      container.remove();
      container = null;
      if (debugOverlay) debugOverlay.remove();
      return;
    }

    // Определяме следващата стъпка
    const nextIndex = nextStepIndex !== null ? nextStepIndex : (stepIndex !== -1 ? stepIndex + 1 : -1);

    if (nextIndex !== -1 && nextIndex < activeSteps.length) {
      showStep(nextIndex);
    } else {
      container.remove();
      container = null;
      if (debugOverlay) debugOverlay.remove(); // Remove debug overlay when guide ends
    }
  };

  img.onclick = nextStep;

  // Добавяме поддръжка за клавиатура (Enter и Space)
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
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
  img.onclick = wrappedNextStep;

  // Автоматично преминаване след 10 секунди (само ако не е single режим)
  if (!single) {
    stepTimer = setTimeout(wrappedNextStep, stepTime);
  }

  // Позициониране спрямо елемент
  // Позициониране спрямо елемент
  // Fallback to body to ensure hero appears and is draggable even if target is invalid
  let targetEl = document.querySelector(step.target) || document.body;
  if (targetEl) {
    let isDragging = false;

    // Функция за непрекъснато обновяване на позицията
    const updatePosition = () => {
      if (!container || !document.body.contains(container)) return;

      // Ако влачим, не обновяваме автоматично, за да не пречим на потребителя
      if (!isDragging) {
        const imgOffsetLeft = img.offsetLeft;
        const imgOffsetTop = img.offsetTop;
        const rect = targetEl.getBoundingClientRect();

        container.style.left = (rect.left + window.scrollX + step.x - imgOffsetLeft) + "px";
        container.style.top = (rect.top + window.scrollY + step.y - imgOffsetTop) + "px";

        // Показваме контейнера едва след като сме го позиционирали
        if (container.style.visibility === 'hidden') {
          container.style.visibility = 'visible';
        }
      }

      animationFrameId = requestAnimationFrame(updatePosition);
    };

    // Изчакваме картинката да се зареди, за да имаме коректни размери (offsetLeft/Top)
    const startPositioning = () => {
      updatePosition();
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
      if (stepTimer) clearTimeout(stepTimer); // Спираме таймера при взаимодействие

      isDragging = true; // Спираме автоматичното позициониране
      wasDragged = false;
      startX = e.clientX;
      startY = e.clientY;

      if (!container) return;

      initialLeft = parseInt(container.style.left || 0);
      initialTop = parseInt(container.style.top || 0);

      document.onmousemove = (moveEvent) => {
        if (!container) return;

        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        // Отчитаме влачене само ако има движение над 3 пиксела
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          wasDragged = true;
        }

        if (wasDragged) {
          container.style.left = initialLeft + dx + "px";
          container.style.top = initialTop + dy + "px";

          // Identify element at top-right of image
          const currentImgRect = img.getBoundingClientRect();
          const pointerX = currentImgRect.right - 10;
          const pointerY = currentImgRect.top + 10;

          container.style.visibility = 'hidden';
          const el = document.elementFromPoint(pointerX, pointerY);
          container.style.visibility = 'visible';

          let elId = '';
          const currentImgRectForCalc = img.getBoundingClientRect();
          let currentTargetRectForCalc = targetEl.getBoundingClientRect(); // Default to original target

          if (el) {
            elId = el.id ? '#' + el.id : el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c !== 'kb-highlight'); // Filter out highlight class
              if (classes.length > 0 && !el.id) elId += '.' + classes[0];
            }
            // Use the new element's rect for calculation
            currentTargetRectForCalc = el.getBoundingClientRect();
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
          // Identify element at top-right of image
          const currentImgRect = img.getBoundingClientRect();
          const pX = currentImgRect.right - 10;
          const pY = currentImgRect.top + 10;

          container.style.visibility = 'hidden';
          const el = document.elementFromPoint(pX, pY);
          container.style.visibility = 'visible';

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
            // Re-calculate final relative coordinates based on the NEW target (if found)
            finalRelX = Math.round(currentImgRect.left - currentTargetRectForCalc.left);
            finalRelY = Math.round(currentImgRect.top - currentTargetRectForCalc.top);

            // Запазваме новите координати в обекта step, за да не се връща назад
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

          // Ако е имало влачене, спираме клика
          img.onclick = null;
          setTimeout(() => { img.onclick = wrappedNextStep; }, 100);
        }
        // Ако НЕ е имало влачене, оставяме onclick да се изпълни (nextStep)
      };
    };

    // Touch support for image drag
    img.ontouchstart = (e) => {
      e.preventDefault();
      if (stepTimer) clearTimeout(stepTimer);

      isDragging = true;
      wasDragged = false;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;

      if (!container) return;

      initialLeft = parseInt(container.style.left || 0);
      initialTop = parseInt(container.style.top || 0);



      container.style.visibility = 'hidden';
      const el = document.elementFromPoint(pointerX, pointerY);
      container.style.visibility = 'visible';

      let elId = '';
      let currentTargetRectForCalc = targetEl.getBoundingClientRect(); // Default

      if (el) {
        elId = el.id ? '#' + el.id : el.tagName.toLowerCase();
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(' ').filter(c => c !== 'kb-highlight');
          if (classes.length > 0 && !el.id) elId += '.' + classes[0];
        }
        currentTargetRectForCalc = el.getBoundingClientRect();
      }

      finalRelX = Math.round(currentImgRect.left - currentTargetRectForCalc.left);
      finalRelY = Math.round(currentImgRect.top - currentTargetRectForCalc.top);

      debugOverlay.innerText = `Target: ${elId || 'None'} | x: ${finalRelX}, y: ${finalRelY}`;
    }
  };

  document.ontouchend = () => {
    // Ensure visibility is restored
    container.style.visibility = 'visible';

    document.ontouchmove = null;
    document.ontouchend = null;
    isDragging = false;

    if (wasDragged) {
      // Identify element at top-right of image
      const currentImgRect = img.getBoundingClientRect();
      const pX = currentImgRect.right - 10;
      const pY = currentImgRect.top + 10;

      container.style.visibility = 'hidden';
      const el = document.elementFromPoint(pX, pY);
      container.style.visibility = 'visible';

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

        // Запазваме новите координати в обекта step, за да не се връща назад
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

      // Ако е имало влачене, спираме клика
      img.onclick = null;
      setTimeout(() => { img.onclick = wrappedNextStep; }, 100);
    } else {
      // Ако НЕ е имало влачене, ръчно извикваме nextStep, защото preventDefault в touchstart спира click събитието
      wrappedNextStep();
    }
  };
};



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

        // Обновяваме step координатите
        const img = container.querySelector('.guide-img');
        if (img) {
          // Намираме текущата активна стъпка (която се показва)
          // В момента не пазим текущия индекс на стъпката в глобална променлива лесно достъпна тук,
          // но можем да обходим всички и да видим коя съвпада.
          // За по-просто тук само позиционираме визуално.
        }

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
  const oldWidth = imgEl ? imgEl.getBoundingClientRect().width : (currentActiveStep.height || 100);

  let src = currentActiveStep.image;
  let newSrc = src;

  let isLeftToRight = false;
  if (src.includes('l-up')) {
    newSrc = src.replace('l-up', 'r-up');
    isLeftToRight = true;
  } else if (src.includes('r-up')) {
    newSrc = src.replace('r-up', 'l-up');
    isLeftToRight = false;
  }

  if (newSrc !== src) {
    currentActiveStep.image = newSrc;

    // Initial estimation
    let deltaX = isLeftToRight ? -oldWidth : oldWidth;
    let initialX = currentActiveStep.x || 0;
    currentActiveStep.x = initialX + deltaX;

    if (imgEl) {
      const cleanSrc = newSrc.endsWith('!') ? newSrc.slice(0, -1) : newSrc;

      imgEl.onload = () => {
        const newWidth = imgEl.getBoundingClientRect().width;

        // Correction if L->R and widths differ
        if (isLeftToRight && Math.abs(newWidth - oldWidth) > 0.5) {
          const correction = oldWidth - newWidth;
          currentActiveStep.x += correction;
        }

        const debugOverlay = document.getElementById('msm-debug-overlay');
        if (debugOverlay) {
          debugOverlay.innerText = `Flipped: ${newSrc}\nNew x: ${Math.round(currentActiveStep.x)}`;
        }
        imgEl.onload = null;
      };
      imgEl.src = cleanSrc;
    }

    const debugOverlay = document.getElementById('msm-debug-overlay');
    if (debugOverlay) {
      debugOverlay.innerText = `Flipped: ${newSrc}\nNew x: ${Math.round(currentActiveStep.x)}`;
    }
  }
};


