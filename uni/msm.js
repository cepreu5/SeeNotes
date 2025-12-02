// Преводи за текстовете в ръководството
const guideTexts = {
  en: [
    "<h2>Welcome!</h2><h3>I'm <b>Mr. StickyMan</b> - your guide to the world of sticky notes.</h3>",
    "Here you can add new notes.",
    "And here you will see the statistics.",
    "<h3>This icon shows that the note has an attachment. If you click it, you will see a preview in the note.</h3>",
    "<h3>I like this kind of Shoping list.</h3>",

  ],
  bg: [
    "Добре дошъли!<br>Аз съм <b>Lepcho</b> - вашият екскурзовод в света на лепящите бележки.",
    "Тук можеш да добавиш нови записи.",
    "А тук ще видиш статистиката.",
    "<h3>Тази иконка показва, че към бележката има приложение. Ако я кликнеш, ще видиш умален вариант в бележката.</h3>",
    "<h3>I like this kind of Shoping list."
  ]
};

// Получаваме текущия език от localStorage (по подразбиране 'en')
const getCurrentLanguage = () => localStorage.getItem('language') || 'en';

const steps = [
  {
    image: "msm/1.png", height: 200, target: "#lang-bg-main", x: -198, y: 27, bx: 173, by: 47,
    textKey: 0
  },
  {
    image: "msm/1.png", height: 150, target: "#lang-bg-main", x: -269, y: 341, bx: 149, by: 50,
    textKey: 1
  },
  {
    image: "msm/1.png", height: 150, target: "#lang-bg-main", x: -198, y: 27, bx: 173, by: 47,
    textKey: 2
  },
  {
    image: "msm/right-up.png", height: 150, target: "#search-box", x: -201, y: 292, bx: 80, by: -14,
    textKey: 3
  },
  {
    image: "msm/right-up.png", height: 150, target: "#search-box", x: 367, y: 233, bx: 80, by: -14,
    textKey: 4
  },
];

let container;
let stepTimer;
let stepTime = 50000;
let animationFrameId;

function showStep(stepIndex, nextStepIndex = null, single = false) {
  if (stepTimer) clearTimeout(stepTimer);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  const step = steps[stepIndex];
  if (!step) return;

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
  const currentLang = getCurrentLanguage();
  const stepText = guideTexts[currentLang][step.textKey];
  bubble.innerHTML = stepText;

  // Прилагаме относителни координати за балона
  const bx = step.bx || 0;
  const by = step.by || 0;
  bubble.style.transform = `translate(${bx}px, ${by}px)`;
  bubble.style.cursor = "grab";

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

  // --- BUBBLE DRAG LOGIC ---
  let bubbleWasDragged = false;

  bubble.onclick = (e) => {
    // Ако балонът не е бил влачен, предаваме клика на героя
    if (!bubbleWasDragged) {
      img.click();
    }
    bubbleWasDragged = false;
  };

  bubble.onmousedown = (e) => {
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
        navigator.clipboard.writeText(`bx: ${finalBx}, by: ${finalBy}`);
        debugOverlay.innerText = `Copied: bx: ${finalBx}, by: ${finalBy}`;
      }
    };
  };

  // Touch support for bubble drag
  bubble.ontouchstart = (e) => {
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
        navigator.clipboard.writeText(`bx: ${finalBx}, by: ${finalBy}`);
        debugOverlay.innerText = `Copied: bx: ${finalBx}, by: ${finalBy}`;
      } else {
        // Ако не е имало влачене, симулираме клик на героя
        img.click();
      }
    };
  };

  const img = document.createElement("img");
  img.src = step.image;
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

    // Ако е single режим, просто затваряме
    if (single) {
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
          const clipboardText = `x: ${finalRelX}, y: ${finalRelY}, bx: ${currentBx}, by: ${currentBy}`;
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
          const clipboardText = `x: ${finalRelX}, y: ${finalRelY}, bx: ${currentBx}, by: ${currentBy}`;
          navigator.clipboard.writeText(clipboardText);
          debugOverlay.innerText = `Copied: ${clipboardText}`;
        }
        // Ако НЕ е имало влачене, оставяме onclick да се изпълни (nextStep)
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

    // Single click - start guide
    appTitle.addEventListener('click', () => {
      showStep(4, 4, true);
    });

    // Double click - center guide on screen
    appTitle.addEventListener('dblclick', (e) => {
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

        // Показваме контейнера на новата позиция
        container.style.visibility = 'visible';
      }
    });

    // Double tap detection for mobile
    let lastTapTime = 0;
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
  }
});
