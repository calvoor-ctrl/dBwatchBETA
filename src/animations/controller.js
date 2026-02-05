import { player } from './bootstrap.js';
import { classify, getStateConfig, resolveTransition, buildRangePath } from './model.js';

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

export async function onReading(dbValue) {
    if (!isPlayerReady()) {
        return;
    }

    try {
        const normalizedValue = Number.isFinite(dbValue) ? dbValue : 0;
        const nextRange = classify(normalizedValue);
        if (!nextRange) {
            return;
        }

        if (nextRange === previousRange) {
            return;
        }

        const path = buildRangePath(previousRange, nextRange);
        previousRange = nextRange;

        const sequenceId = ++sequenceCounter;
        await playTransitionSequence(path, sequenceId);
    } catch (error) {
        console.warn('[animations] onReading failed', error);
    }
}
