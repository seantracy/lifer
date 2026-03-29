const mainTiles = document.querySelectorAll('#color-grid .tile');
const mainEllipses = document.querySelectorAll('#color-grid .tile-ellipsis');
const modalTiles = document.querySelectorAll('#modal-grid .tile');
const modalBackdrop = document.querySelector('#tile-modal');
const modalCloseButton = document.querySelector('#tile-modal-close');
const resetButton = document.querySelector('#reset-button');
const defaultPlayerNamesByIndex = ['Player 1', 'Player 2', 'Player 4', 'Player 3'];
const playerNameByIndex = [...defaultPlayerNamesByIndex];
const modalStateByTile = Array.from(mainTiles, () => [0, 0, 0, 0]);
const appliedModalDeductionByTile = Array.from(mainTiles, () => 0);
const eliminatedMainTileByIndex = Array.from(mainTiles, () => false);
const storageKey = 'lifer-state-v1';
const defaultMainCount = 40;
const defaultModalCount = 0;
let mainTileControllers = [];
let modalTileControllers = [];

let activeModalTileIndex = null;
let isRestoringPersistedState = false;

function installGlobalSafariZoomGuard() {
    let lastTouchEndAt = 0;

    document.addEventListener('touchend', (event) => {
        const now = Date.now();

        if (now - lastTouchEndAt < 350) {
            event.preventDefault();
        }

        lastTouchEndAt = now;
    }, { passive: false });

    // iOS-only gesture events fired for pinch zoom on Safari.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
        document.addEventListener(eventName, (event) => {
            event.preventDefault();
        }, { passive: false });
    });
}

installGlobalSafariZoomGuard();

function readPersistedState() {
    try {
        const rawState = window.localStorage.getItem(storageKey);

        if (!rawState) {
            return null;
        }

        const parsedState = JSON.parse(rawState);

        return parsedState && typeof parsedState === 'object' ? parsedState : null;
    } catch {
        return null;
    }
}

function applyPersistedState() {
    const persistedState = readPersistedState();

    if (!persistedState) {
        return { mainCounts: [], tileColors: [] };
    }

    if (Array.isArray(persistedState.playerNames)) {
        persistedState.playerNames.forEach((name, index) => {
            if (typeof name === 'string') {
                playerNameByIndex[index] = name.trim() || defaultPlayerNamesByIndex[index] || '';
            }
        });
    }

    if (Array.isArray(persistedState.modalCounts)) {
        persistedState.modalCounts.forEach((savedCounts, tileIndex) => {
            if (!Array.isArray(savedCounts) || !modalStateByTile[tileIndex]) {
                return;
            }

            modalStateByTile[tileIndex] = modalStateByTile[tileIndex].map((defaultValue, countIndex) => {
                const savedValue = savedCounts[countIndex];
                return Number.isFinite(savedValue) ? savedValue : defaultValue;
            });
            appliedModalDeductionByTile[tileIndex] = getModalTotalForTile(tileIndex);
        });
    }

    if (Array.isArray(persistedState.eliminatedMainTileByIndex)) {
        persistedState.eliminatedMainTileByIndex.forEach((isEliminated, index) => {
            eliminatedMainTileByIndex[index] = Boolean(isEliminated);
        });
    }

    return {
        mainCounts: Array.isArray(persistedState.mainCounts) ? persistedState.mainCounts : [],
        tileColors: Array.isArray(persistedState.tileColors) ? persistedState.tileColors : [],
    };
}

function getCurrentModalStateSnapshot() {
    const snapshot = modalStateByTile.map((counts) => [...counts]);

    if (activeModalTileIndex !== null && modalTileControllers.length > 0) {
        snapshot[activeModalTileIndex] = modalTileControllers.map((controller) => controller.getCount());
    }

    return snapshot;
}

function getCurrentMainCountSnapshot() {
    const snapshot = mainTileControllers.map((controller) => controller.getCount());

    if (activeModalTileIndex !== null && modalTileControllers.length > 0) {
        const currentModalTotal = modalTileControllers.reduce((total, controller) => total + controller.getCount(), 0);
        const previousModalTotal = appliedModalDeductionByTile[activeModalTileIndex] || 0;
        snapshot[activeModalTileIndex] -= currentModalTotal - previousModalTotal;
    }

    return snapshot;
}

function persistState() {
    if (isRestoringPersistedState || mainTileControllers.length === 0) {
        return;
    }

    const nextState = {
        mainCounts: getCurrentMainCountSnapshot(),
        modalCounts: getCurrentModalStateSnapshot(),
        eliminatedMainTileByIndex: [...eliminatedMainTileByIndex],
        playerNames: [...playerNameByIndex],
        tileColors: mainTileControllers.map((controller) => controller.getColor()),
    };

    try {
        window.localStorage.setItem(storageKey, JSON.stringify(nextState));
    } catch {
        return;
    }
}

function setModalOpenState(isOpen) {
    modalBackdrop.hidden = !isOpen;
    modalBackdrop.setAttribute('aria-hidden', String(!isOpen));
    document.body.classList.toggle('modal-open', isOpen);
}

function updateResetButtonBackground() {
    if (!resetButton || mainTileControllers.length !== 4) {
        return;
    }

    const [topLeft, topRight, bottomLeft, bottomRight] = mainTileControllers.map((controller) => controller.getColor());
    resetButton.style.background = [
        `radial-gradient(circle at 30% 30%, ${topLeft} 0%, transparent 58%)`,
        `radial-gradient(circle at 70% 30%, ${topRight} 0%, transparent 58%)`,
        `radial-gradient(circle at 30% 70%, ${bottomLeft} 0%, transparent 58%)`,
        `radial-gradient(circle at 70% 70%, ${bottomRight} 0%, transparent 58%)`,
        `radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0) 62%)`,
        `rgba(17, 17, 17, 0.8)`
    ].join(', ');
}

function resetAppState() {
    isRestoringPersistedState = true;

    activeModalTileIndex = null;
    setModalOpenState(false);

    playerNameByIndex.forEach((_, index) => {
        playerNameByIndex[index] = defaultPlayerNamesByIndex[index] || '';
        eliminatedMainTileByIndex[index] = false;
        appliedModalDeductionByTile[index] = 0;
        modalStateByTile[index] = modalStateByTile[index].map(() => defaultModalCount);
    });

    updatePlayerNameInputsForIndex(0);
    updatePlayerNameInputsForIndex(1);
    updatePlayerNameInputsForIndex(2);
    updatePlayerNameInputsForIndex(3);

    const resetColors = randomDistinctColors(mainTileControllers.length);

    mainTileControllers.forEach((controller, index) => {
        controller.setCount(defaultMainCount);
        controller.setForcedDefeated(false);
        controller.setColor(resetColors[index]);
    });

    modalTileControllers.forEach((controller, index) => {
        controller.setCount(defaultModalCount);
        const matchingMainTile = mainTileControllers[index];
        controller.setColor(matchingMainTile ? matchingMainTile.getColor() : randomColor());
    });

    isRestoringPersistedState = false;
    updateResetButtonBackground();

    try {
        window.localStorage.removeItem(storageKey);
    } catch {
        return;
    }
}

const { mainCounts: persistedMainCounts, tileColors: persistedTileColors } = applyPersistedState();

function updatePlayerNameInputsForIndex(tileIndex) {
    const nextName = playerNameByIndex[tileIndex] || defaultPlayerNamesByIndex[tileIndex] || '';
    const matchingInputs = document.querySelectorAll(`.tile[data-index="${tileIndex}"] .player-name`);

    matchingInputs.forEach((input) => {
        if (input.value !== nextName) {
            input.value = nextName;
        }
    });
}

function initializePlayerNames() {
    const allPlayerNameInputs = document.querySelectorAll('.player-name');

    allPlayerNameInputs.forEach((input) => {
        const tile = input.closest('.tile');

        if (!tile) {
            return;
        }

        const tileIndex = Number(tile.dataset.index);

        input.value = playerNameByIndex[tileIndex] || defaultPlayerNamesByIndex[tileIndex] || '';

        const syncName = () => {
            const trimmed = input.value.trim();
            playerNameByIndex[tileIndex] = trimmed || defaultPlayerNamesByIndex[tileIndex] || '';
            updatePlayerNameInputsForIndex(tileIndex);
            persistState();
        };

        input.addEventListener('input', syncName);
        input.addEventListener('blur', syncName);
    });
}

initializePlayerNames();

const minimumContrastWithBlack = 5;

function hslToRgb(hue, saturation, lightness) {
    const h = ((hue % 360) + 360) % 360;
    const s = Math.max(0, Math.min(100, saturation)) / 100;
    const l = Math.max(0, Math.min(100, lightness)) / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - chroma / 2;
    let red = 0;
    let green = 0;
    let blue = 0;

    if (h < 60) {
        red = chroma;
        green = x;
    } else if (h < 120) {
        red = x;
        green = chroma;
    } else if (h < 180) {
        green = chroma;
        blue = x;
    } else if (h < 240) {
        green = x;
        blue = chroma;
    } else if (h < 300) {
        red = x;
        blue = chroma;
    } else {
        red = chroma;
        blue = x;
    }

    return [
        Math.round((red + m) * 255),
        Math.round((green + m) * 255),
        Math.round((blue + m) * 255),
    ];
}

function toLinearSrgb(channel) {
    const normalized = channel / 255;
    if (normalized <= 0.04045) {
        return normalized / 12.92;
    }

    return Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function contrastWithBlackFromHsl(hue, saturation, lightness) {
    const [red, green, blue] = hslToRgb(hue, saturation, lightness);
    const luminance =
        0.2126 * toLinearSrgb(red) +
        0.7152 * toLinearSrgb(green) +
        0.0722 * toLinearSrgb(blue);

    return (luminance + 0.05) / 0.05;
}

function parseHslColor(colorText) {
    const match = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(colorText);

    if (!match) {
        return null;
    }

    return {
        hue: Number(match[1]),
        saturation: Number(match[2]),
        lightness: Number(match[3]),
    };
}

function hasStrongContrastWithBlack(colorText) {
    if (typeof colorText !== 'string') {
        return false;
    }

    const parsedColor = parseHslColor(colorText);

    if (!parsedColor) {
        return false;
    }

    return contrastWithBlackFromHsl(parsedColor.hue, parsedColor.saturation, parsedColor.lightness) >= minimumContrastWithBlack;
}

function randomAccessibleColorForHue(hue) {
    for (let attempt = 0; attempt < 24; attempt++) {
        const saturation = 78 + Math.floor(Math.random() * 22);
        const lightness = 54 + Math.floor(Math.random() * 17);

        if (contrastWithBlackFromHsl(hue, saturation, lightness) >= minimumContrastWithBlack) {
            return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
        }
    }

    return `hsl(${Math.round(hue)}, 88%, 70%)`;
}

function randomDistinctColors(count) {
    const startHue = Math.floor(Math.random() * 360);
    const step = 360 / count;
    const jitter = step * 0.18;
    const colors = Array.from({ length: count }, (_, i) => {
        const hue = Math.round((startHue + i * step + (Math.random() * 2 - 1) * jitter + 360) % 360);
        return randomAccessibleColorForHue(hue);
    });
    // Fisher-Yates shuffle so tile assignment order is random
    for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    return colors;
}

function initializeTile(tile, initialCount, options = {}) {
    const {
        minCount = Number.NEGATIVE_INFINITY,
        maxCount = Number.POSITIVE_INFINITY,
        defeatThreshold = null,
        defeatAtOrBelow = null,
        defeatText = 'X',
        lockWhenDefeated = false,
        reviveOnPositiveDelta = false,
        onCountChange = null,
    } = options;
    const counterValue = tile.querySelector('.counter-value');
    const leftDelta = document.createElement('span');
    const rightDelta = document.createElement('span');

    leftDelta.className = 'delta-indicator left';
    rightDelta.className = 'delta-indicator right';
    tile.append(leftDelta, rightDelta);

    let count = initialCount;
    let activeTimeout = null;
    let holdTimeout = null;
    let leftDeltaTimeout = null;
    let rightDeltaTimeout = null;
    let shakeTimeout = null;
    let lastTouchEndAt = 0;
    let isPressing = false;
    let longPressTriggered = false;
    let pressSide = null;
    let baseColor = tile.style.backgroundColor;
    let forcedDefeated = false;

    function isDefeated() {
        const thresholdDefeated = defeatThreshold !== null && count >= defeatThreshold;
        const zeroDefeated = defeatAtOrBelow !== null && count <= defeatAtOrBelow;
        return forcedDefeated || thresholdDefeated || zeroDefeated;
    }

    function syncVisualState() {
        const defeated = isDefeated();
        tile.classList.toggle('tile-defeated', defeated);
        if (defeated && defeatText === 'XX') {
            counterValue.innerHTML = '<img class="skull-icon" src="skull.png" alt="Eliminated">';
        } else {
            counterValue.textContent = defeated ? defeatText : String(count);
        }
    }

    function syncCounter() {
        syncVisualState();
    }

    syncCounter();

    function showDelta(side, delta) {
        const indicator = side === 'left' ? leftDelta : rightDelta;
        const timeoutRef = side === 'left' ? leftDeltaTimeout : rightDeltaTimeout;
        const nextText = delta > 0 ? `+${delta}` : `${delta}`;

        indicator.textContent = nextText;
        indicator.classList.remove('show');
        void indicator.offsetWidth;
        indicator.classList.add('show');

        if (timeoutRef) {
            clearTimeout(timeoutRef);
        }

        const clearTimer = setTimeout(() => {
            indicator.classList.remove('show');
        }, 330);

        if (side === 'left') {
            leftDeltaTimeout = clearTimer;
            return;
        }

        rightDeltaTimeout = clearTimer;
    }

    function triggerHeavyHitEffect() {
        counterValue.classList.remove('counter-shake');
        void counterValue.offsetWidth;
        counterValue.classList.add('counter-shake');

        if (shakeTimeout) {
            clearTimeout(shakeTimeout);
        }

        shakeTimeout = setTimeout(() => {
            counterValue.classList.remove('counter-shake');
            shakeTimeout = null;
        }, 240);
    }

    function updateCounter(delta) {
        if (lockWhenDefeated && isDefeated()) {
            if (!reviveOnPositiveDelta || delta <= 0) {
                return;
            }

            forcedDefeated = false;
        }

        const nextCount = Math.max(minCount, Math.min(maxCount, count + delta));
        const appliedDelta = nextCount - count;

        if (appliedDelta === 0) {
            return;
        }

        count = nextCount;
        syncCounter();
        showDelta(appliedDelta < 0 ? 'left' : 'right', appliedDelta);

        if (Math.abs(appliedDelta) >= 10) {
            triggerHeavyHitEffect();
        }

        if (onCountChange) {
            onCountChange(count);
        }
    }

    function getSideFromEvent(event) {
        const rect = tile.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const midpoint = rect.width / 2;
        return clickX < midpoint ? 'left' : 'right';
    }

    function setActiveSide(side) {
        if (side === 'left') {
            tile.classList.add('active-left');
            tile.classList.remove('active-right');
            return;
        }

        tile.classList.add('active-right');
        tile.classList.remove('active-left');
    }

    function clearActiveSide() {
        tile.classList.remove('active-left', 'active-right');
    }

    function pulseAndClearActive() {
        if (activeTimeout) {
            clearTimeout(activeTimeout);
        }

        activeTimeout = setTimeout(() => {
            clearActiveSide();
            activeTimeout = null;
        }, 120);
    }

    tile.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        if (event.target.closest('.tile-ellipsis')) {
            return;
        }

        if (event.target.closest('.player-name')) {
            return;
        }

        isPressing = true;
        longPressTriggered = false;
        pressSide = getSideFromEvent(event);
        setActiveSide(pressSide);

        if (holdTimeout) {
            clearTimeout(holdTimeout);
        }

        function scheduleHoldRepeat() {
            holdTimeout = setTimeout(() => {
                if (!isPressing || !pressSide) {
                    return;
                }

                longPressTriggered = true;
                updateCounter(pressSide === 'left' ? -10 : 10);
                scheduleHoldRepeat();
            }, 1000);
        }

        scheduleHoldRepeat();

        if (tile.setPointerCapture) {
            tile.setPointerCapture(event.pointerId);
        }
    });

    tile.addEventListener('pointerup', (event) => {
        if (!isPressing || !pressSide) {
            return;
        }

        if (holdTimeout) {
            clearTimeout(holdTimeout);
            holdTimeout = null;
        }


        if (!longPressTriggered) {
            updateCounter(pressSide === 'left' ? -1 : 1);
        }

        isPressing = false;
        pressSide = null;
        pulseAndClearActive();

        if (tile.releasePointerCapture) {
            tile.releasePointerCapture(event.pointerId);
        }
    });

    tile.addEventListener('pointercancel', () => {
        isPressing = false;
        pressSide = null;
        longPressTriggered = false;

        if (holdTimeout) {
            clearTimeout(holdTimeout);
            holdTimeout = null;
        }


        if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
        }

        clearActiveSide();
    });

    tile.addEventListener('pointerleave', () => {
        if (!isPressing) {
            return;
        }

        isPressing = false;
        pressSide = null;
        longPressTriggered = false;

        if (holdTimeout) {
            clearTimeout(holdTimeout);
            holdTimeout = null;
        }


        pulseAndClearActive();
    });

    tile.addEventListener('touchend', (event) => {
        const now = Date.now();

        if (now - lastTouchEndAt < 350) {
            // iOS Safari fallback: suppress double-tap page zoom on rapid repeated taps.
            event.preventDefault();
        }

        lastTouchEndAt = now;
    }, { passive: false });

    return {
        setCount(nextCount) {
            count = Math.max(minCount, Math.min(maxCount, nextCount));
            syncCounter();
            leftDelta.classList.remove('show');
            rightDelta.classList.remove('show');
            counterValue.classList.remove('counter-shake');
            clearActiveSide();

            if (onCountChange) {
                onCountChange(count);
            }
        },
        getCount() {
            return count;
        },
        setForcedDefeated(nextValue) {
            forcedDefeated = Boolean(nextValue);
            syncVisualState();

            if (!forcedDefeated && !isDefeated()) {
                tile.style.backgroundColor = baseColor;
            }
        },
        isDefeated() {
            return isDefeated();
        },
        setColor(nextColor) {
            baseColor = nextColor;
            if (!isDefeated()) {
                tile.style.backgroundColor = baseColor;
            }

            updateResetButtonBackground();
        },
        getColor() {
            return baseColor;
        },
    };
}

const initialColors = randomDistinctColors(mainTiles.length);

mainTileControllers = Array.from(mainTiles, (tile, index) => {
    const controller = initializeTile(tile, defaultMainCount, {
        minCount: 0,
        defeatAtOrBelow: 0,
        defeatText: 'XX',
        lockWhenDefeated: true,
        reviveOnPositiveDelta: true,
        onCountChange: persistState,
    });
    const savedColor = persistedTileColors[index];
    controller.setColor(hasStrongContrastWithBlack(savedColor) ? savedColor : initialColors[index]);
    return controller;
});

modalTileControllers = Array.from(modalTiles, (tile, index) => {
    const controller = initializeTile(tile, defaultModalCount, {
        minCount: 0,
        onCountChange: persistState,
    });
    const matchingMainTile = mainTileControllers[index];
    controller.setColor(matchingMainTile ? matchingMainTile.getColor() : randomColor());
    return controller;
});

isRestoringPersistedState = true;

mainTileControllers.forEach((controller, index) => {
    const savedMainCount = persistedMainCounts[index];
    controller.setCount(Number.isFinite(savedMainCount) ? savedMainCount : defaultMainCount);
    controller.setForcedDefeated(eliminatedMainTileByIndex[index]);
});

isRestoringPersistedState = false;
updateResetButtonBackground();
persistState();

function getModalTotalForTile(tileIndex) {
    const modalCounts = modalStateByTile[tileIndex] || [];
    return modalCounts.reduce((total, value) => total + value, 0);
}

function applyModalDeductionToMainTile(tileIndex) {
    const mainController = mainTileControllers[tileIndex];

    if (!mainController) {
        return;
    }

    const nextDeduction = getModalTotalForTile(tileIndex);
    const previousDeduction = appliedModalDeductionByTile[tileIndex] || 0;
    const deltaDeduction = nextDeduction - previousDeduction;

    if (deltaDeduction !== 0) {
        mainController.setCount(mainController.getCount() - deltaDeduction);
    }

    appliedModalDeductionByTile[tileIndex] = nextDeduction;
}

function openTileModal(tileIndex) {
    activeModalTileIndex = tileIndex;
    const savedCounts = modalStateByTile[tileIndex] || [0, 0, 0, 0];

    modalTileControllers.forEach((controller, index) => {
        controller.setCount(savedCounts[index] ?? 0);
        const matchingMainTile = mainTileControllers[index];
        controller.setColor(matchingMainTile ? matchingMainTile.getColor() : randomColor());
    });

    applyModalDeductionToMainTile(tileIndex);

    setModalOpenState(true);
}

function closeTileModal() {
    if (activeModalTileIndex !== null) {
        modalStateByTile[activeModalTileIndex] = modalTileControllers.map((controller) => controller.getCount());
        applyModalDeductionToMainTile(activeModalTileIndex);

        const shouldEliminateOpener = modalTileControllers.some((controller) => controller.getCount() >= 21);

        if (shouldEliminateOpener) {
            eliminatedMainTileByIndex[activeModalTileIndex] = true;
            const openerMainTileController = mainTileControllers[activeModalTileIndex];

            if (openerMainTileController) {
                openerMainTileController.setForcedDefeated(true);
            }
        }

        persistState();
    }

    setModalOpenState(false);
    activeModalTileIndex = null;
}

mainEllipses.forEach((ellipsis, tileIndex) => {
    ellipsis.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
    });

    ellipsis.addEventListener('click', (event) => {
        event.stopPropagation();
        openTileModal(tileIndex);
    });
});

resetButton.addEventListener('click', (event) => {
    event.stopPropagation();
    resetAppState();
});

modalCloseButton.addEventListener('click', closeTileModal);

modalBackdrop.addEventListener('click', (event) => {
    if (event.target !== modalBackdrop) {
        return;
    }

    closeTileModal();
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || modalBackdrop.hidden) {
        return;
    }

    closeTileModal();
});
