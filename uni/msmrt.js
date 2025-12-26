/**
 * MSM Runtime (Lean) - Guide Execution Only
 * Stripped of debug/editing tools.
 */

let container;
let stepTimer;
let currentActiveStep = null;
let stepTime = 10000;
let animationFrameId;
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

window.removeGuide = function () {
    if (stepTimer) clearTimeout(stepTimer);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (container && document.body.contains(container)) {
        container.remove();
        container = null;
    }
};

window.showStep = showStep;

window.refreshGuideLanguage = function () {
    if (!container || !document.body.contains(container) || !currentActiveStep) return;

    let newLang = localStorage.getItem('language') || 'en';
    let step = currentActiveStep;
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

    const bubble = container.querySelector('.speech-bubble');
    if (bubble) {
        const span = bubble.querySelector('span');
        if (span) {
            span.innerHTML = newText;
        } else {
            bubble.innerHTML = `<span>${newText}</span>`;
        }

        if (step.bWidth) bubble.style.width = step.bWidth + 'px';
        if (step.bHeight) bubble.style.height = step.bHeight + 'px';

        if (!newText) {
            bubble.style.display = 'none';
        } else {
            bubble.style.display = 'block';
        }
    }
};

function showStep(stepOrIndex, nextStepIndex = null, single = false) {
    if (stepTimer) {
        clearTimeout(stepTimer);
        stepTimer = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

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
    currentActiveStep = step;

    // Execute onStart callback if exists
    if (typeof step.onStart === 'function') {
        step.onStart();
    }

    let imagePath = step.image;
    let stopAfter = step.stopAfter || false;
    if (imagePath && imagePath.endsWith('!')) {
        stopAfter = true;
        imagePath = imagePath.slice(0, -1);
    }

    if (!container || !document.body.contains(container)) {
        container = document.createElement('div');
        container.className = 'guide-container';
        container.style.position = 'absolute';
        container.style.visibility = 'hidden'; // Hide initially to prevent jump
        container.style.zIndex = '10000';
        container.style.pointerEvents = 'none'; // Pass clicks through container
        document.body.appendChild(container);
    } else {
        // Reuse container but hide it until ready
        container.style.visibility = 'hidden';
        container.style.left = '0px';
        container.style.top = '0px';
    }

    container.innerHTML = '';

    const img = document.createElement('img');
    img.src = imagePath;
    img.className = 'guide-img';
    img.style.cursor = "pointer";
    img.style.pointerEvents = "auto"; // Catch clicks on image

    if (step.height) {
        img.style.height = step.height + 'px';
        img.style.width = 'auto';
    }

    container.appendChild(img);

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';
    bubble.style.position = 'absolute';
    bubble.style.pointerEvents = "auto"; // Catch clicks on bubble

    let currentLang = localStorage.getItem('language') || 'en';
    let text = '';
    if (step.text) {
        if (typeof step.text === 'object') {
            text = step.text[currentLang] || step.text['en'] || '';
        } else {
            text = step.text;
        }
    } else if (typeof guideTexts !== 'undefined' && step.textKey) {
        text = guideTexts[currentLang][step.textKey];
    }

    if (text) {
        bubble.innerHTML = `<span>${text}</span>`;

        if (step.bWidth) bubble.style.width = step.bWidth + 'px';
        if (step.bHeight) bubble.style.height = step.bHeight + 'px';

        const bx = step.bx || 0;
        const by = step.by || 0;
        bubble.style.transform = `translate(${bx}px, ${by}px)`;

        // Create Play/Resume Button
        const playBtn = document.createElement('div');
        playBtn.className = 'msm-play-btn';
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        playBtn.style.position = 'absolute';
        playBtn.style.bottom = '5px';
        playBtn.style.right = '5px';
        playBtn.style.width = '24px';
        playBtn.style.height = '24px';
        playBtn.style.background = 'rgba(0,0,0,0.1)';
        playBtn.style.borderRadius = '50%';
        playBtn.style.cursor = 'pointer';
        playBtn.style.display = 'none'; // Hidden by default
        playBtn.style.alignItems = 'center';
        playBtn.style.justifyContent = 'center';
        playBtn.style.color = '#555';
        playBtn.style.zIndex = '10';
        playBtn.title = 'Resume';

        // Hover effect via JS since inline styles
        playBtn.onmouseenter = () => playBtn.style.background = 'rgba(0,0,0,0.2)';
        playBtn.onmouseleave = () => playBtn.style.background = 'rgba(0,0,0,0.1)';

        playBtn.onclick = (e) => {
            e.stopPropagation(); // Stop bubbling to bubble click handler
            nextStep();
        };

        bubble.appendChild(playBtn);

        container.appendChild(bubble);
    } else {
        bubble.style.display = 'none';
    }

    // Navigation Logic
    const nextStep = () => {
        if (stepTimer) clearTimeout(stepTimer);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        if (single || stopAfter) {
            window.removeGuide();
            return;
        }

        const nextIndex = nextStepIndex !== null ? nextStepIndex : (stepIndex !== -1 ? stepIndex + 1 : -1);
        if (nextIndex !== -1 && nextIndex < activeSteps.length) {
            showStep(nextIndex);
        } else {
            window.removeGuide();
        }
    };

    const imgClickHandler = (e) => {
        if (e.ctrlKey) {
            window.removeGuide();
        } else {
            nextStep();
        }
    };

    const bubbleClickHandler = (e) => {
        if (e.ctrlKey) {
            window.removeGuide();
        } else {
            // "Pause" - just clear the timer so it doesn't auto-advance
            if (stepTimer) {
                clearTimeout(stepTimer);
                stepTimer = null;
                // Show play button
                const btn = container.querySelector('.msm-play-btn');
                if (btn) {
                    btn.style.display = 'flex';
                }
            }
        }
    };

    img.onclick = imgClickHandler;
    bubble.onclick = bubbleClickHandler;

    // Keyboard Navigation
    const handleKeyPress = (e) => {
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

    // Auto Advance logic moved to updatePosition to ensure full view time
    let stepTimerStarted = false;


    // Positioning
    let targetEl = step.target ? document.querySelector(step.target) : document.body;
    let scrollDelay = 0;

    if (targetEl && targetEl !== document.body && targetEl !== document.documentElement) {
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

    const updatePosition = () => {
        if (!container || !document.body.contains(container)) return;

        // --- FIX: Check image and target readiness to prevent loops ---
        if (!img.complete || img.naturalWidth === 0) {
            animationFrameId = requestAnimationFrame(updatePosition);
            return;
        }

        if (!img.offsetParent) {
            // Image hidden
            animationFrameId = requestAnimationFrame(updatePosition);
            return;
        }

        if (!targetEl || !document.body.contains(targetEl)) {
            targetEl = step.target ? document.querySelector(step.target) : document.body;
            if (!targetEl) targetEl = document.body;
        }

        const rect = targetEl.getBoundingClientRect();

        // Check if target is actually visible
        if (rect.width === 0 && rect.height === 0) {
            container.style.visibility = 'hidden';
            animationFrameId = requestAnimationFrame(updatePosition);
            return;
        }

        const imgOffsetLeft = img.offsetLeft;
        const imgOffsetTop = img.offsetTop;

        // Position container
        container.style.left = (rect.left + window.scrollX + (step.x || 0) - imgOffsetLeft) + "px";
        container.style.top = (rect.top + window.scrollY + (step.y || 0) - imgOffsetTop) + "px";

        if (container.style.visibility === 'hidden') {
            container.style.visibility = 'visible';
        }

        // Start timer only when visible
        if (!stepTimer && !single && !stepTimerStarted) {
            stepTimerStarted = true;
            let duration = step.time || stepTime;
            stepTimer = setTimeout(() => {
                document.removeEventListener('keydown', handleKeyPress);
                nextStep();
            }, duration);
        }

        // Bubble screen boundary check
        if (text) {
            // --- FIX: Use clientWidth/Height to exclude scrollbars logic ---
            const vpW = document.documentElement.clientWidth;
            const vpH = document.documentElement.clientHeight;

            const curBx = step.bx || 0;
            const curBy = step.by || 0;
            const cRect = container.getBoundingClientRect();

            // Calculate "Ideal" position relative to viewport
            const idealLeft = cRect.left + curBx;
            const idealTop = cRect.top + curBy;
            const bubbleW = bubble.offsetWidth;
            const bubbleH = bubble.offsetHeight;
            const idealRight = idealLeft + bubbleW;
            const idealBottom = idealTop + bubbleH;

            const padding = 10;
            let shiftX = 0;
            let shiftY = 0;

            if (idealLeft < padding) shiftX = padding - idealLeft;
            else if (idealRight > vpW - padding) shiftX = (vpW - padding) - idealRight;

            if (idealTop < padding) shiftY = padding - idealTop;
            else if (idealBottom > vpH - padding) shiftY = (vpH - padding) - idealBottom;

            // Apply transform
            bubble.style.transform = `translate(${curBx + shiftX}px, ${curBy + shiftY}px)`;
        }

        animationFrameId = requestAnimationFrame(updatePosition);
    };

    if (img.complete) {
        if (scrollDelay > 0) {
            setTimeout(updatePosition, scrollDelay);
        } else {
            updatePosition();
        }
    } else {
        img.onload = () => {
            if (scrollDelay > 0) {
                setTimeout(updatePosition, scrollDelay);
            } else {
                updatePosition();
            }
        };
    }
}

// Fallback toggle
window.toggleHero = function () {
    if (container) {
        window.removeGuide();
        return false;
    }
    return true;
};

