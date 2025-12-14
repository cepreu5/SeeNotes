let container;
let stepTimer;
let stepTime = 50000;
let animationFrameId;

container = document.createElement("div");
container.className = "guide-container";
container.style.visibility = 'hidden'; // Скриваме първоначално
document.body.appendChild(container);

function showStep(stepIndex, nextStepIndex = null, single = false) {
  if (stepTimer) clearTimeout(stepTimer);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  const step = steps[stepIndex];
  if (!step) return;

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
  const stepText = guideTexts[currentBubbleLang][step.textKey];
  bubble.innerHTML = stepText;

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
      const newText = guideTexts[currentBubbleLang][step.textKey];
      bubble.innerHTML = newText;
      // Re-append resize handle as innerHTML wipes it out
      bubble.appendChild(resizeHandle);
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
        currentBubbleLang = currentBubbleLang === 'en' ? 'bg' : 'en';

        // Обновяваме текста на балона
        const newText = guideTexts[currentBubbleLang][step.textKey];
        bubble.innerHTML = newText;
        bubble.appendChild(resizeHandle);
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
    const nextIndex = nextStepIndex !== null ? nextStepIndex : stepIndex + 1;

    if (nextIndex < steps.length) {
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
  const targetEl = document.querySelector(step.target);
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

          // Изчисляване на новите относителни координати спрямо КАРТИНКАТА
          const currentImgRect = img.getBoundingClientRect();
          const currentTargetRect = targetEl.getBoundingClientRect();

          finalRelX = Math.round(currentImgRect.left - currentTargetRect.left);
          finalRelY = Math.round(currentImgRect.top - currentTargetRect.top);

          debugOverlay.innerText = `Image: x: ${finalRelX}, y: ${finalRelY}`;
        }
      };

      document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
        isDragging = false; // Разрешаваме отново автоматичното позициониране

        if (wasDragged) {
          // Запазваме новите координати в обекта step, за да не се връща назад
          step.x = finalRelX;
          step.y = finalRelY;

          const currentBx = step.bx || 0;
          const currentBy = step.by || 0;

          // Ако е имало влачене, спираме клика
          img.onclick = null;
          setTimeout(() => { img.onclick = wrappedNextStep; }, 100);

          // Copy to clipboard - включваме и координатите на балона
          const currentBWidth = step.bWidth || 0;
          const currentBHeight = step.bHeight || 0;
          const clipboardText = `x: ${finalRelX}, y: ${finalRelY}, bx: ${currentBx}, by: ${currentBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}`;
          navigator.clipboard.writeText(clipboardText);
          debugOverlay.innerText = `Copied: ${clipboardText}`;
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

      document.ontouchmove = (moveEvent) => {
        if (!container) return;

        const moveTouch = moveEvent.touches[0];
        const dx = moveTouch.clientX - startX;
        const dy = moveTouch.clientY - startY;

        // Отчитаме влачене само ако има движение над 3 пиксела
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          wasDragged = true;
        }

        if (wasDragged) {
          container.style.left = initialLeft + dx + "px";
          container.style.top = initialTop + dy + "px";

          // Изчисляване на новите относителни координати спрямо КАРТИНКАТА
          const currentImgRect = img.getBoundingClientRect();
          const currentTargetRect = targetEl.getBoundingClientRect();

          finalRelX = Math.round(currentImgRect.left - currentTargetRect.left);
          finalRelY = Math.round(currentImgRect.top - currentTargetRect.top);

          debugOverlay.innerText = `Image: x: ${finalRelX}, y: ${finalRelY}`;
        }
      };

      document.ontouchend = () => {
        document.ontouchmove = null;
        document.ontouchend = null;
        isDragging = false;

        if (wasDragged) {
          // Запазваме новите координати в обекта step, за да не се връща назад
          step.x = finalRelX;
          step.y = finalRelY;

          const currentBx = step.bx || 0;
          const currentBy = step.by || 0;

          // Ако е имало влачене, спираме клика
          img.onclick = null;
          setTimeout(() => { img.onclick = wrappedNextStep; }, 100);

          // Copy to clipboard - включваме и координатите на балона
          const currentBWidth = step.bWidth || 0;
          const currentBHeight = step.bHeight || 0;
          const clipboardText = `x: ${finalRelX}, y: ${finalRelY}, bx: ${currentBx}, by: ${currentBy}, bWidth: ${currentBWidth}, bHeight: ${currentBHeight}`;
          navigator.clipboard.writeText(clipboardText);
          debugOverlay.innerText = `Copied: ${clipboardText}`;
        } else {
          // Ако НЕ е имало влачене, ръчно извикваме nextStep, защото preventDefault в touchstart спира click събитието
          wrappedNextStep();
        }
      };
    };
  }
}

// Стартиране при клик върху заглавието
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
        for (let i = 0; i < steps.length; i++) {
          const targetEl = document.querySelector(steps[i].target);
          if (img && targetEl) {
            const imgRect = img.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();

            steps[i].x = Math.round(imgRect.left - targetRect.left);
            steps[i].y = Math.round(imgRect.top - targetRect.top);
            break;
          }
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

    // Показваме контейнера на новата позиция
    container.style.visibility = 'visible';
  }
});

// Double tap detection for mobile
let lastTapTime = 0;
const appTitle = document.querySelector('h1[data-key="appTitle"]');
appTitle.addEventListener('touchend', (e) => {
  const currentTime = new Date().getTime();
  const tapInterval = currentTime - lastTapTime;

  if (tapInterval < 300 && tapInterval > 0) {
    // Double tap detected
    e.preventDefault(); // Предотвратява избор на текст и zoom
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
      for (let i = 0; i < steps.length; i++) {
        const targetEl = document.querySelector(steps[i].target);
        if (img && targetEl) {
          const imgRect = img.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();

          steps[i].x = Math.round(imgRect.left - targetRect.left);
          steps[i].y = Math.round(imgRect.top - targetRect.top);
          break;
        }
      }

      // Показваме контейнера на новата позиция
      container.style.visibility = 'visible';
    }
    lastTapTime = 0; // Reset
  } else {
    lastTapTime = currentTime;
  }
});
