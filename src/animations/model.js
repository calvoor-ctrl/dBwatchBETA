/**
 * Animation model describing dB ranges, steady states, and transition clips.
 */

export const STATE_SEQUENCE = ['S1', 'S2', 'S3', 'SF'];
export const DEFAULT_TRANSITION_DURATION = 2000;

export const ranges = {
    S1: { label: '<75dB', min: -Infinity, max: 75, test: v => v < 75 },
    S2: { label: '75–90dB', min: 75, max: 90, test: v => v >= 75 && v < 90 },
    S3: { label: '90db+', min: 90, max: Infinity, test: v => v >= 90 }
};

export const files = {
    state: {
        S1: { file: './media/state_1.json', mode: 'forward', loop: true },
        S2: { file: './media/state_2.json', mode: 'forward', loop: true },
        S3: { file: './media/state_3.json', mode: 'forward', loop: true },
        SF: { file: './media/state_final.json', mode: 'forward', loop: true }
    },
    transition: {
        S1_S2: { file: './media/transition_1_2.json', durationMs: 700 },
        S2_S3: { file: './media/transition_2_3.json', durationMs: 467 }
    }
};

export function classify(dbValue) {
    let value = Number(dbValue);
    if (!Number.isFinite(value)) {
        value = 0;
    }
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

// Stateful manager to handle SF (final state) timeout and persistence behavior.
// - If input stays in `S3` continuously for `SF_TIMEOUT_MS`, switch to `SF`.
// - While in `SF`, remain until input drops to `S2` (i.e. below 90dB).
// - Exiting `SF` to `S2` returns a reverse-played `S2_S3` transition.
export const SF_TIMEOUT_MS = 10000;

export const animationState = {
    currentRange: null,
    inSF: false,
    s3EnteredAt: null,

    reset() {
        this.currentRange = null;
        this.inSF = false;
        this.s3EnteredAt = null;
    },

    // Update state with the latest dB value. Returns { range, transition }.
    // `transition` matches the shape returned by `resolveTransition` (or null).
    update(dbValue, now = Date.now()) {
        const baseRange = classify(dbValue);

        // If currently in SF, only exit when input drops to S2
        if (this.inSF) {
            if (baseRange === 'S2') {
                // Exit SF -> S2 using reverse of S2_S3 transition (if available)
                this.inSF = false;
                this.s3EnteredAt = null;
                this.currentRange = 'S2';

                const base = files.transition['S2_S3'];
                if (base) {
                    return {
                        range: 'S2',
                        transition: {
                            key: 'S2_S3',
                            direction: 'down',
                            file: base.file,
                            durationMs: base.durationMs ?? DEFAULT_TRANSITION_DURATION,
                            mode: 'reverse'
                        }
                    };
                }

                // Fallback to generic resolveTransition behavior
                return { range: 'S2', transition: resolveTransition('S3', 'S2') };
            }

            // Stay in SF for any other input
            this.currentRange = 'SF';
            return { range: 'SF', transition: null };
        }

        // Not in SF currently
        if (baseRange === 'S3') {
            // Mark time when S3 was first entered
            if (this.s3EnteredAt == null) {
                this.s3EnteredAt = now;
            }

            // If stayed in S3 long enough, enter SF
            if (now - this.s3EnteredAt >= SF_TIMEOUT_MS) {
                this.inSF = true;
                this.currentRange = 'SF';
                this.s3EnteredAt = null;
                return { range: 'SF', transition: null };
            }

            // Otherwise, remain in S3 and return any adjacent transition
            const transition = resolveTransition(this.currentRange, 'S3');
            this.currentRange = 'S3';
            return { range: 'S3', transition };
        }

        // Any non-S3 input clears the S3 timer
        this.s3EnteredAt = null;

        // Normal behavior for other ranges (S1, S2)
        const transition = resolveTransition(this.currentRange, baseRange);
        this.currentRange = baseRange;
        return { range: baseRange, transition };
    }
};
