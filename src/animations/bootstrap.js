import { DotLottie } from '../dotlottie-web.js';

export const canvas = document.getElementById('main_canvas');

const INITIAL_STATE_SRC = './media/state_1.json';

let playerInstance = null;

const setDvh = () => {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight * 0.01}px`);
};

const resizeCanvas = () => {
    if (!canvas) {
        return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);

    if (playerInstance?.resize) {
        try {
            playerInstance.resize({
                width: canvas.width,
                height: canvas.height
            });
        } catch (error) {
            console.warn('[animations] Failed to resize DotLottie player', error);
        }
    }
};


const ensurePlayer = () => {
    if (playerInstance || !canvas) {
        return playerInstance;
    }

    try {
        playerInstance = new DotLottie({
            canvas,
            autoplay: true,
            loop: true,
            autoResize: true,
            renderConfig: {
                freezeOnOffscreen: true,
                devicePixelRatio: window.devicePixelRatio || 1
            },
            mode: 'forward',
            src: INITIAL_STATE_SRC
        });
    } catch (error) {
        console.warn('[animations] Failed to initialize DotLottie', error);
        playerInstance = null;
    }

    return playerInstance;
};

const reloadInitialState = async () => {
    const player = ensurePlayer();
    if (!player || typeof player.load !== 'function') {
        return;
    }

    try {
        await player.load({
            src: INITIAL_STATE_SRC,
            autoplay: true,
            loop: true,
            mode: 'forward'
        });
    } catch (error) {
        console.warn('[animations] Failed to reload initial animation state', error);
    }
};

if (canvas) {
    setDvh();
    resizeCanvas();
    window.addEventListener('resize', () => {
        setDvh();
        resizeCanvas();
    });
    window.addEventListener('pageshow', () => {
        setDvh();
        resizeCanvas();
        reloadInitialState();
    });
} else {
    console.warn('[animations] main_canvas not found; DotLottie bootstrap skipped');
}

export const player = ensurePlayer();

if (player) {
    reloadInitialState();
}

// Ensure layout is set to cover so animation scales to fill viewport (like preserveAspectRatio: 'xMidYMid slice')
if (player && typeof player.setLayout === 'function') {
    try {
        player.setLayout({ fit: 'cover' });
    } catch (e) {
        console.warn('[animations] Failed to apply layout:cover', e);
    }
}

// Make sure renderer uses current DPR if available
if (player && typeof player.setRenderConfig === 'function') {
    try {
        player.setRenderConfig({ devicePixelRatio: window.devicePixelRatio || 1 });
    } catch (e) {
        console.warn('[animations] Failed to apply renderConfig devicePixelRatio', e);
    }
}

// Force transparent canvas background so body background shows through
try {
    if (player && typeof player.setBackgroundColor === 'function') {
        player.setBackgroundColor('transparent');
    } else if (canvas) {
        canvas.style.backgroundColor = 'transparent';
    }
} catch (e) {
    console.warn('[animations] Failed to force transparent canvas background', e);
}

// Wrap/monkey-patch player's load to ensure layout + resize + transparent background are applied after every load
if (player && typeof player.load === 'function') {
    const originalLoad = player.load.bind(player);
    player.load = async function (opts) {
        const res = await originalLoad(opts);
        try {
            // Ensure layout=cover and DPR applied
            if (typeof player.setLayout === 'function') {
                player.setLayout({ fit: 'cover' });
            }
            if (typeof player.setRenderConfig === 'function') {
                player.setRenderConfig({ devicePixelRatio: window.devicePixelRatio || 1 });
            }
            // Resize to current canvas pixel size
            if (typeof player.resize === 'function' && canvas) {
                const ratio = window.devicePixelRatio || 1;
                await player.resize({ width: Math.floor(window.innerWidth * ratio), height: Math.floor(window.innerHeight * ratio) });
            }
            if (typeof player.setBackgroundColor === 'function') {
                player.setBackgroundColor('transparent');
            } else if (canvas) {
                canvas.style.backgroundColor = 'transparent';
            }
        } catch (e) {
            console.warn('[animations] post-load adjustments failed', e);
        }
        return res;
    };
}
