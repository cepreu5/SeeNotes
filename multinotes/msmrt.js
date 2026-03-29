/** terser msmrt.js -c 'pure_funcs=["console.log"]' --format comments=false --output msmrtt.js
 * MSM Runtime (Lean) - Guide Execution Only
 * Stripped of debug/editing tools.
 */

let container;
let stepTimer;
let currentActiveStep = null;
let stepTime = 10000;
let animationFrameId;
let activeSteps = typeof steps !== 'undefined' ? steps : [];
let isTempNoteOpen = false;

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
    if (isTempNoteOpen) {
        const modal = document.getElementById('content-modal');
        if (modal) modal.classList.remove('visible');
        isTempNoteOpen = false;
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

    // Execute onStart callback if exists and wait for animations
    const continueShowStep = () => {
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
            container.style.opacity = '0'; // Hide initially to prevent jump
            container.style.zIndex = '10000';
            container.style.pointerEvents = 'none'; // Pass clicks through container
            container.style.transition = 'none'; // Ensure no transition initially
            document.body.appendChild(container);
        } else {
            // Reuse container but hide it until ready
            container.style.transition = 'none'; // Disable transition for instant hide
            container.style.opacity = '0';
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
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            playBtn.style.position = 'absolute';
            playBtn.style.top = '-10px'; // Top-right corner
            playBtn.style.right = '-10px';
            playBtn.style.width = '32px';
            playBtn.style.height = '32px';
            playBtn.style.background = '#ffffff';
            playBtn.style.border = '2px solid #0078d7';
            playBtn.style.borderRadius = '50%';
            playBtn.style.cursor = 'pointer';
            playBtn.style.display = 'none'; // Hidden by default
            playBtn.style.alignItems = 'center';
            playBtn.style.justifyContent = 'center';
            playBtn.style.color = '#0078d7';
            playBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
            playBtn.style.zIndex = '100';
            playBtn.title = 'Resume / Next';
            // Hover effect via JS since inline styles
            playBtn.onmouseenter = () => {
                playBtn.style.transform = 'scale(1.1)';
                playBtn.style.background = '#f0f0f0';
            };
            playBtn.onmouseleave = () => {
                playBtn.style.transform = 'scale(1)';
                playBtn.style.background = '#ffffff';
            };
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

        // Long press logic
        let longPressTimer;
        const longPressDuration = 800; // 800ms

        const startLongPress = (e) => {
            longPressTimer = setTimeout(() => {
                window.removeGuide();
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

        // Prevent context menu on long press (mobile)
        img.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

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
            // Check if element is in a scrollable container (like Settings modal)
            const scrollableParent = targetEl.closest('.modal-content-box, #settings-modal-body, .scrollable-content');
            if (scrollableParent) {
                // Scroll within the modal/container
                const parentRect = scrollableParent.getBoundingClientRect();
                const elementRect = targetEl.getBoundingClientRect();
                // Check if element is outside the visible area of the scrollable parent
                if (elementRect.top < parentRect.top || elementRect.bottom > parentRect.bottom) {
                    // Calculate scroll position to center the element
                    const scrollTop = targetEl.offsetTop - (scrollableParent.clientHeight / 2) + (targetEl.offsetHeight / 2);
                    scrollableParent.scrollTo({
                        top: scrollTop,
                        behavior: 'smooth'
                    });
                    scrollDelay = 600;
                }
            } else {
                // Scroll the window
                const rect = targetEl.getBoundingClientRect();
                const vpW = window.visualViewport ? window.visualViewport.width : (window.innerWidth || document.documentElement.clientWidth);
                const vpH = window.visualViewport ? window.visualViewport.height : (window.innerHeight || document.documentElement.clientHeight);
                const isVisible = (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= vpH &&
                    rect.right <= vpW
                );
                if (!isVisible) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    scrollDelay = 600;
                }
            }
        }
        const updatePosition = () => {
            if (!container || !document.body.contains(container)) return;
            // --- FIX: Check image readiness, allow proceeding if complete even if size is 0 (load error) ---
            if (!img.complete) {
                animationFrameId = requestAnimationFrame(updatePosition);
                return;
            }
            // Removed strict offsetParent check to avoid potential deadlock with visibility/opacity
            if (!document.body.contains(img)) {
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
                container.style.opacity = '0';
                animationFrameId = requestAnimationFrame(updatePosition);
                return;
            }
            const imgOffsetLeft = img.offsetLeft;
            const imgOffsetTop = img.offsetTop;
            // Position container
            container.style.left = (rect.left + window.scrollX + (step.x || 0) - imgOffsetLeft) + "px";
            container.style.top = (rect.top + window.scrollY + (step.y || 0) - imgOffsetTop) + "px";
            if (container.style.opacity === '0') {
                container.style.transition = 'opacity 0.3s ease';
                container.style.opacity = '1';
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
                // --- FIX: Use visualViewport if available for better mobile accuracy ---
                const vpW = window.visualViewport ? window.visualViewport.width : (window.innerWidth || document.documentElement.clientWidth);
                const vpH = window.visualViewport ? window.visualViewport.height : (window.innerHeight || document.documentElement.clientHeight);
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
                const padding = 3;
                let shiftX = 0;
                let shiftY = 0;
                if (idealLeft < padding) shiftX = padding - idealLeft;
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
    };

    // Execute onStart callback if exists, then continue after delay
    if (typeof step.onStart === 'function') {
        step.onStart();
        // Wait for accordion animation to complete (increased to 500ms)
        setTimeout(() => {
            continueShowStep();
        }, 500);
    } else {
        // No onStart, continue immediately
        continueShowStep();
    }

}

// Fallback toggle
window.toggleHero = function () {
    if (container) {
        window.removeGuide();
        return false;
    }
    showStep(0);
    return true;
};
