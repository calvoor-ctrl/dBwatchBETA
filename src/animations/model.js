/**
 * Animation model describing dB ranges, steady states, and transition clips.
 */

export const STATE_SEQUENCE = ['S1', 'S2', 'S3', 'S4', 'S5'];
export const DEFAULT_TRANSITION_DURATION = 2000;

export const ranges = {
    S1: { label: '<70dB', min: -Infinity, max: 70, test: v => v < 70 },
    S2: { label: '70–85dB', min: 70, max: 85, test: v => v >= 70 && v < 85 },
    S3: { label: '85–100dB', min: 85, max: 100, test: v => v >= 85 && v < 100 },
    S4: { label: '100–120dB', min: 100, max: 120, test: v => v >= 100 && v < 120 },
    S5: { label: '120dB+', min: 120, max: Infinity, test: v => v >= 120 }
};

export const files = {
    state: {
        S1: { file: './media/state_1.json', mode: 'forward', loop: true },
        S2: { file: './media/state_2.json', mode: 'forward', loop: true },
        S3: { file: './media/state_3.json', mode: 'forward', loop: true },
        S4: { file: './media/state_4.json', mode: 'forward', loop: true },
        S5: { file: './media/state_5.json', mode: 'forward', loop: true }
    },
    transition: {
        S1_S2: { file: './media/transition_1_2.json', durationMs: 2000 },
        S2_S3: { file: './media/transition_2_3.json', durationMs: 2000 },
        S3_S4: { file: './media/transition_3_4.json', durationMs: 2000 },
        S4_S5: { file: './media/transition_4_5.json', durationMs: 2000 }
    }
};

export function classify(dbValue) {
    const value = Number.isFinite(dbValue) ? dbValue : 0;
    for (const key of STATE_SEQUENCE) {
        const range = ranges[key];
        if (range?.test?.(value)) {
            return key;
        }
    }
    return STATE_SEQUENCE[STATE_SEQUENCE.length - 1];
}

export function getStateConfig(range) {
    return files.state[range] ?? null;
}

export function getRangeDirection(prevRange, nextRange) {
    if (!prevRange || !nextRange || prevRange === nextRange) {
        return 'steady';
    }
    const prevIndex = STATE_SEQUENCE.indexOf(prevRange);
    const nextIndex = STATE_SEQUENCE.indexOf(nextRange);
    if (prevIndex === -1 || nextIndex === -1) {
        return 'steady';
    }
    if (nextIndex > prevIndex) {
        return 'up';
    }
    if (nextIndex < prevIndex) {
        return 'down';
    }
    return 'steady';
}

export function resolveTransition(prevRange, nextRange) {
    const direction = getRangeDirection(prevRange, nextRange);
    if (direction === 'steady') {
        return null;
    }

    const prevIndex = STATE_SEQUENCE.indexOf(prevRange);
    const nextIndex = STATE_SEQUENCE.indexOf(nextRange);
    if (prevIndex === -1 || nextIndex === -1) {
        return null;
    }

    if (Math.abs(prevIndex - nextIndex) !== 1) {
        // Only adjacent ranges have dedicated transition files.
        return null;
    }

    const [startRange, endRange] = direction === 'up'
        ? [prevRange, nextRange]
        : [nextRange, prevRange];

    const key = `${startRange}_${endRange}`;
    const base = files.transition[key];
    if (!base) {
        return null;
    }

    return {
        key,
        direction,
        file: base.file,
        durationMs: base.durationMs ?? DEFAULT_TRANSITION_DURATION,
        mode: direction === 'up' ? 'forward' : 'reverse'
    };
}

export function buildRangePath(prevRange, nextRange) {
    if (!prevRange || !nextRange) {
        return nextRange ? [nextRange] : [];
    }

    const prevIndex = STATE_SEQUENCE.indexOf(prevRange);
    const nextIndex = STATE_SEQUENCE.indexOf(nextRange);
    if (prevIndex === -1 || nextIndex === -1) {
        return [nextRange];
    }

    if (prevIndex === nextIndex) {
        return [nextRange];
    }

    const step = nextIndex > prevIndex ? 1 : -1;
    const path = [];
    for (let i = prevIndex; ; i += step) {
        path.push(STATE_SEQUENCE[i]);
        if (i === nextIndex) {
            break;
        }
    }
    return path;
}
