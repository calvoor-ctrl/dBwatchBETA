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

// ==============================================
// Dynamic Background Color Management
// ==============================================

/**
 * Color keyframes for dB-based background color mapping
 * Format: { dB: number, hex: string }
 */
const COLOR_KEYFRAMES = [
    { dB: 76, hex: '#a4f12c' },
    { dB: 85, hex: '#f1e22c' },
    { dB: 95, hex: '#ef8e2e' },
    { dB: 105, hex: '#ee5b2d' }
];

/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color string (e.g., '#a4f12c')
 * @returns {Object} RGB object { r: 0-255, g: 0-255, b: 0-255 }
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

/**
 * Convert RGB object to hex color string
 * @param {Object} rgb - RGB object { r: 0-255, g: 0-255, b: 0-255 }
 * @returns {string} Hex color string (e.g., '#a4f12c')
 */
function rgbToHex(rgb) {
    const toHex = (value) => {
        const hex = Math.round(value).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Linear interpolation between two values
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} factor - Interpolation factor (0-1, where 0 = start, 1 = end)
 * @returns {number} Interpolated value
 */
function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

/**
 * Linear interpolation between two RGB colors
 * @param {Object} colorA - RGB object { r, g, b }
 * @param {Object} colorB - RGB object { r, g, b }
 * @param {number} factor - Interpolation factor (0-1)
 * @returns {Object} Interpolated RGB object
 */
function interpolateColor(colorA, colorB, factor) {
    return {
        r: lerp(colorA.r, colorB.r, factor),
        g: lerp(colorA.g, colorB.g, factor),
        b: lerp(colorA.b, colorB.b, factor)
    };
}

/**
 * Calculate background color based on dB input level
 * Uses linear interpolation between color keyframes
 * @param {number} dbValue - Current dB level
 * @returns {string} Hex color string for the background
 */
export function getBackgroundColor(dbValue) {
    let value = Number(dbValue);
    if (!Number.isFinite(value)) {
        value = 76;
    }

    // Handle values below the minimum keyframe
    if (value <= COLOR_KEYFRAMES[0].dB) {
        return COLOR_KEYFRAMES[0].hex;
    }

    // Handle values above the maximum keyframe
    if (value >= COLOR_KEYFRAMES[COLOR_KEYFRAMES.length - 1].dB) {
        return COLOR_KEYFRAMES[COLOR_KEYFRAMES.length - 1].hex;
    }

    // Find the two keyframes to interpolate between
    for (let i = 0; i < COLOR_KEYFRAMES.length - 1; i++) {
        const current = COLOR_KEYFRAMES[i];
        const next = COLOR_KEYFRAMES[i + 1];

        if (value >= current.dB && value < next.dB) {
            // Interpolate between current and next keyframe
            const range = next.dB - current.dB;
            const position = value - current.dB;
            const factor = position / range;

            const colorA = hexToRgb(current.hex);
            const colorB = hexToRgb(next.hex);
            const interpolated = interpolateColor(colorA, colorB, factor);

            return rgbToHex(interpolated);
        }
    }

    // Fallback to the first keyframe
    return COLOR_KEYFRAMES[0].hex;
}
