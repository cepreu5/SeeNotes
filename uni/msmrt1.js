let container;
let stepTimer;
let stepTime = 15000;
let animationFrameId;

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

    // Прилагаме размери, ако са зададени
    if (step.bWidth) bubble.style.width = step.bWidth + 'px';
    if (step.bHeight) bubble.style.height = step.bHeight + 'px';

    container.appendChild(bubble);

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
            return;
        }

        // Определяме следващата стъпка
        const nextIndex = nextStepIndex !== null ? nextStepIndex : stepIndex + 1;

        if (nextIndex < steps.length) {
            showStep(nextIndex);
        } else {
            container.remove();
            container = null;
        }
    };

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

    // Функция за спиране на ръководството
    const stopGuide = () => {
        if (stepTimer) clearTimeout(stepTimer);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        document.removeEventListener('keydown', handleKeyPress);
        if (container) {
            container.remove();
            container = null;
        }
    };

    // Обща функция за обработка на клик/tap с логика за спиране
    const handleInteraction = (e) => {
        // Ctrl+Click спира ръководството
        if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            stopGuide();
            return;
        }
        // Нормален клик - следваща стъпка
        wrappedNextStep();
    };

    // Логика за Long Press (за мобилни устройства)
    let longPressTimer;
    const startPress = (e) => {
        longPressTimer = setTimeout(() => {
            stopGuide();
        }, 500); // 500ms за long press
    };

    const endPress = (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    // Прикачане на събития към картинката
    img.onclick = handleInteraction;
    img.addEventListener('mousedown', startPress);
    img.addEventListener('mouseup', endPress);
    img.addEventListener('mouseleave', endPress);
    img.addEventListener('touchstart', startPress);
    img.addEventListener('touchend', endPress);

    // Прикачане на събития към балона
    bubble.onclick = handleInteraction;
    bubble.addEventListener('mousedown', startPress);
    bubble.addEventListener('mouseup', endPress);
    bubble.addEventListener('mouseleave', endPress);
    bubble.addEventListener('touchstart', startPress);
    bubble.addEventListener('touchend', endPress);

    // Автоматично преминаване след 10 секунди (само ако не е single режим)
    if (!single) {
        stepTimer = setTimeout(wrappedNextStep, stepTime);
    }

    // Позициониране спрямо елемент
    const targetEl = document.querySelector(step.target);
    if (targetEl) {
        // Функция за непрекъснато обновяване на позицията
        const updatePosition = () => {
            if (!container || !document.body.contains(container)) return;

            const imgOffsetLeft = img.offsetLeft;
            const imgOffsetTop = img.offsetTop;
            const rect = targetEl.getBoundingClientRect();

            container.style.left = (rect.left + window.scrollX + step.x - imgOffsetLeft) + "px";
            container.style.top = (rect.top + window.scrollY + step.y - imgOffsetTop) + "px";

            // Показваме контейнера едва след като сме го позиционирали
            if (container.style.visibility === 'hidden') {
                container.style.visibility = 'visible';
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
    }
}
