import { player } from './bootstrap.js';
import { classify, getStateConfig, resolveTransition, buildRangePath, animationState, getBackgroundColor } from './model.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

let previousRange = classify(0);
let sequenceCounter = 0;

function isPlayerReady() {
    return Boolean(player && typeof player.load === 'function');
}

async function loadClip({ src, mode = 'forward', loop = false }) {
    if (!isPlayerReady() || !src) {
        return;
    }

    try {
        await player.load({
            src,
            autoplay: true,
            loop,
            mode
        });
    } catch (error) {
        console.warn('[animations] Failed to load animation clip', error);
    }
}

async function playSteady(range, sequenceId) {
    if (sequenceId !== sequenceCounter) {
        return;
    }

    const stateConfig = getStateConfig(range);
    if (!stateConfig) {
        return;
    }

    await loadClip({
        src: stateConfig.file,
        mode: stateConfig.mode ?? 'forward',
        loop: stateConfig.loop ?? true
    });
}

async function playTransitionSequence(path, sequenceId) {
    if (!path.length) {
        return;
    }

    if (path.length === 1) {
        await playSteady(path[0], sequenceId);
        return;
    }

    for (let i = 0; i < path.length - 1; i += 1) {
        if (sequenceId !== sequenceCounter) {
            return;
        }

        const startRange = path[i];
        const endRange = path[i + 1];
        const transition = resolveTransition(startRange, endRange);

        if (!transition) {
            continue;
        }

        await loadClip({
            src: transition.file,
            mode: transition.mode,
            loop: false
        });

        if (sequenceId !== sequenceCounter) {
            return;
        }

        await delay(transition.durationMs);
    }

    await playSteady(path[path.length - 1], sequenceId);
}

/**
 * Update the background color based on dB value
 * @param {number} dbValue - Current dB level
 */
function updateBackgroundColor(dbValue) {
    const color = getBackgroundColor(dbValue);
    const body = document.body;
    if (body) {
        // Use setProperty with !important to ensure highest CSS priority
        body.style.setProperty('background-color', color, 'important');
    }
}

export async function onReading(dbValue) {
    // Update background color for every dB reading
    updateBackgroundColor(dbValue);

    if (!isPlayerReady()) {
        return;
    }

    try {
        const { range: nextRange, transition } = animationState.update(dbValue);
        if (!nextRange) return;

        if (nextRange === previousRange && !transition) {
            return;
        }

        const oldPrev = previousRange;
        const sequenceId = ++sequenceCounter;

        if (transition) {
            await loadClip({ src: transition.file, mode: transition.mode, loop: false });
            await delay(transition.durationMs);
            await playSteady(nextRange, sequenceId);
            previousRange = nextRange;
            return;
        }

        const path = buildRangePath(oldPrev, nextRange);
        await playTransitionSequence(path, sequenceId);
        previousRange = nextRange;
    } catch (error) {
        console.warn('[animations] onReading failed', error);
    }
}
