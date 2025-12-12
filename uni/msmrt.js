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
        container.style.visibility = 'hidden'; // Hide initially to prevent jump
        container.style.zIndex = '10000';
        container.style.pointerEvents = 'none'; // Pass clicks through container
        document.body.appendChild(container);
    } else {
        // Reuse container but hide it until ready
        container.style.visibility = 'hidden';
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

    img.onclick = nextStep;
    bubble.onclick = nextStep;

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

    // Auto Advance
    if (!single) {
        stepTimer = setTimeout(() => {
            document.removeEventListener('keydown', handleKeyPress);
            nextStep();
        }, stepTime);
    }

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

        if (!img.offsetParent) {
            // Image not visible/ready yet
            animationFrameId = requestAnimationFrame(updatePosition);
            return;
        }

        if (!targetEl || !document.body.contains(targetEl)) {
            // Try validation again
            targetEl = step.target ? document.querySelector(step.target) : document.body;
            if (!targetEl) targetEl = document.body;
        }

        const rect = targetEl.getBoundingClientRect();
        const imgOffsetLeft = img.offsetLeft;
        const imgOffsetTop = img.offsetTop;

        // Position container
        container.style.left = (rect.left + window.scrollX + (step.x || 0) - imgOffsetLeft) + "px";
        container.style.top = (rect.top + window.scrollY + (step.y || 0) - imgOffsetTop) + "px";

        if (container.style.visibility === 'hidden') {
            container.style.visibility = 'visible';
        }

        // Bubble screen boundary check
        if (text) {
            const vpW = window.innerWidth || document.documentElement.clientWidth;
            const vpH = window.innerHeight || document.documentElement.clientHeight;

            const curBx = step.bx || 0;
            const curBy = step.by || 0;
            const cRect = container.getBoundingClientRect();

            const bubbleRect = bubble.getBoundingClientRect();
            const padding = 5;

            let corrX = 0;
            let corrY = 0;

            // Simple Check: is bubble off screen?
            // We calculate intended position relative to screen using the container rect + translate
            // Actually getBoundingClientRect of bubble is enough to check current status, 
            // but we want to correct it.

            if (bubbleRect.left < padding) {
                corrX = padding - bubbleRect.left;
            } else if (bubbleRect.right > vpW - padding) {
                corrX = (vpW - padding) - bubbleRect.right;
            }

            if (bubbleRect.top < padding) {
                corrY = padding - bubbleRect.top;
            } else if (bubbleRect.bottom > vpH - padding) {
                // Only correct up if room?
                corrY = (vpH - padding) - bubbleRect.bottom;
            }

            if (corrX !== 0 || corrY !== 0) {
                // Apply cumulative transform
                // We need to add correction to base translation
                // Note: transform is not additive in JS style string unless we parse it.
                // But we know base is translate(bx, by).
                // Wait, if we keep adding corrX to previous transform, it spirals.
                // We should calculate corrX based on "ideal" position vs viewport.

                // Let's rely on standard calculating:
                // relativeBaseX = cRect.left + curBx;
                // relativeBaseY = cRect.top + curBy;

                // if (relativeBaseX < 0) ...
                // Easier: just set transform with correction
                // But we need to know the correction relative to the Step's bx/by.
                // If we used the logic from msm.js it would be cleaner, but I'll stick to a simpler CSS transform update if needed.
                // Since this runs in a loop, direct transform modification based on current rect acts like a feedback loop which can jitter.
                // Better to calculate "Ideal" rect first.

                const idealLeft = cRect.left + curBx;
                const idealTop = cRect.top + curBy;
                const idealRight = idealLeft + bubble.offsetWidth;
                const idealBottom = idealTop + bubble.offsetHeight;

                let shiftX = 0;
                let shiftY = 0;

                if (idealLeft < padding) shiftX = padding - idealLeft;
                else if (idealRight > vpW - padding) shiftX = (vpW - padding) - idealRight;

                if (idealTop < padding) shiftY = padding - idealTop;
                else if (idealBottom > vpH - padding) shiftY = (vpH - padding) - idealBottom;

                bubble.style.transform = `translate(${curBx + shiftX}px, ${curBy + shiftY}px)`;
            } else {
                bubble.style.transform = `translate(${curBx}px, ${curBy}px)`;
            }
        }

        animationFrameId = requestAnimationFrame(updatePosition);
    };

    const startLoop = () => {
        if (img.complete) updatePosition();
        else img.onload = updatePosition;
    };

    if (scrollDelay > 0) {
        setTimeout(startLoop, scrollDelay);
    } else {
        startLoop();
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
