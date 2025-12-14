/**
 * dBwatch PWA - Stage 5: Polish & Integration
 * Notifications, edge cases, performance tuning
 */

// ===========================================
// Configuration
// ===========================================
const FFT_SIZE = 2048;
const AUDIO_CONSTRAINTS = {
    audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
    }
};

// Debounce/Throttle timing
const DEBOUNCE_DELAY = 300; // For button clicks
const MIN_CLICK_INTERVAL = 500; // Minimum time between Start/Stop clicks

// Update intervals (in milliseconds)
const VISUALIZER_UPDATE_INTERVAL = 500;  // 0.5 seconds
const DB_READING_UPDATE_INTERVAL = 2000; // 2 seconds

// dB Threshold levels for theming
const DB_THRESHOLDS = [
    { min: -Infinity, max: 70, level: 0 },
    { min: 70, max: 85, level: 1 },
    { min: 85, max: 100, level: 2 },
    { min: 100, max: 120, level: 3 },
    { min: 120, max: Infinity, level: 4 }
];

// Theme assets mapping
const THEME_ASSETS = {
    0: { svg: '../media/welcom_logo.svg', bg: '../media/background_image_0.png' },
    1: { svg: '../media/noise_level_msg_1.svg', bg: '../media/background_image_1.png' },
    2: { svg: '../media/noise_level_msg_2.svg', bg: '../media/background_image_2.png' },
    3: { svg: '../media/noise_level_msg_3.svg', bg: '../media/background_image_3.png' },
    4: { svg: '../media/noise_level_msg_4.svg', bg: '../media/background_image_4.png' }
};

// ===========================================
// DOM Elements
// ===========================================
const gearIcon = document.getElementById('gear_icon');
const controlsDialog = document.getElementById('controls_dialog');
const closeDialogBtn = document.getElementById('close_dialog');
const showVisualizerToggle = document.getElementById('show_visualizer');
const showDbReadingToggle = document.getElementById('show_db_reading');
const simModeToggle = document.getElementById('sim_mode');
const simSlider = document.getElementById('sim_slider');
const simSliderContainer = document.getElementById('sim_slider_container');
const visualizer = document.getElementById('visualizer');
const dbReading = document.getElementById('dBreading');
const dbValueElement = dbReading.querySelector('.db-value');
const statusMessage = document.getElementById('status_message');
const startBtn = document.getElementById('start_btn');
const stopBtn = document.getElementById('stop_btn');
const messageSvg = document.getElementById('message_svg');

// ===========================================
// Audio Engine State
// ===========================================
let audioContext = null;
let analyser = null;
let microphone = null;
let mediaStream = null;
let dataArray = null;
let isListening = false;
let animationId = null;

// ===========================================
// UI Update State
// ===========================================
let lastVisualizerUpdate = 0;
let lastDbReadingUpdate = 0;
let currentThemeLevel = 0;
let currentDb = 0;
let isTransitioning = false;

// ===========================================
// Notification State
// ===========================================
let notificationPermission = 'default';

// ===========================================
// Edge Case Prevention State
// ===========================================
let lastStartStopClick = 0;
let isProcessingClick = false;
let pendingVisualizerUpdate = null;
let pendingDbUpdate = null;

// ===========================================
// Audio Calculation Functions
// ===========================================

/**
 * Calculate Root Mean Square (RMS) from audio data
 * @param {Float32Array|number[]} data - Normalized audio data (0-1)
 * @returns {number} RMS value
 */
function calculateRMS(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
}

/**
 * Calculate decibel level from RMS value
 * @param {number} rms - RMS value
 * @param {number} reference - Reference value (default 0.00001)
 * @returns {number} Decibel value
 */
function calculateDB(rms, reference = 0.00001) {
    if (rms > 0) {
        return 20 * Math.log10(rms / reference);
    }
    return -Infinity;
}

// ===========================================
// Error Handling
// ===========================================

/**
 * Get user-friendly error message based on error type
 * @param {Error} error - The error object
 * @returns {string} User-friendly error message
 */
function getErrorMessage(error) {
    const errorMessages = {
        'NotAllowedError': 'Microphone permission denied. Please allow access.',
        'NotFoundError': 'No microphone found on this device.',
        'NotReadableError': 'Microphone is in use by another app.',
        'SecurityError': 'Security error. Try serving over HTTPS or localhost.',
        'AbortError': 'Microphone access was aborted.',
        'OverconstrainedError': 'Microphone constraints cannot be satisfied.'
    };

    return errorMessages[error.name] || `Error: ${error.message}`;
}

// ===========================================
// Notification System (Errors Only)
// ===========================================

/**
 * Request notification permission at app start
 */
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('[Notification] Not supported in this browser');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        notificationPermission = permission;
        console.log('[Notification] Permission:', permission);
    } catch (error) {
        console.warn('[Notification] Permission request failed:', error);
    }
}

/**
 * Show error notification (only for critical errors)
 * @param {string} title - Notification title
 * @param {string} body - Notification body message
 */
function showErrorNotification(title, body) {
    // Only show notifications for errors, not for dB threshold crossings
    if (notificationPermission !== 'granted') {
        console.log('[Notification] Permission not granted, skipping notification');
        return;
    }

    try {
        const notification = new Notification(title, {
            body: body,
            icon: '../icons/icon-192x192.png',
            badge: '../icons/icon-96x96.png',
            tag: 'dbwatch-error', // Prevent duplicate notifications
            requireInteraction: false,
            silent: false
        });

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);

        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } catch (error) {
        console.warn('[Notification] Failed to show notification:', error);
    }
}

// ===========================================
// Status Management
// ===========================================

/**
 * Update status message in the controls dialog
 * @param {string} message - Status message to display
 * @param {boolean} isError - Whether this is an error message
 */
function setStatus(message, isError = false) {
    if (statusMessage) {
        statusMessage.textContent = message;
        statusMessage.classList.toggle('error', isError);
    }

    // Show notification for errors
    if (isError) {
        showErrorNotification('dB Watch Error', message);
    }
}

// ===========================================
// Audio Engine Functions
// ===========================================

/**
 * Initialize and start audio capture
 */
async function startListening() {
    // Edge case: Prevent rapid clicks
    const now = Date.now();
    if (isProcessingClick || (now - lastStartStopClick < MIN_CLICK_INTERVAL)) {
        console.log('Ignoring rapid click');
        return;
    }
    lastStartStopClick = now;
    isProcessingClick = true;

    try {
        setStatus('Requesting microphone access...');
        
        // Stop any existing stream first
        if (mediaStream) {
            stopAudioResources();
        }

        // Request microphone access
        console.log('Requesting microphone stream...');
        mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
        console.log('Microphone stream obtained');

        // Create AudioContext
        console.log('Creating AudioContext...');
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            throw new Error('Web Audio API not supported in this browser');
        }
        
        audioContext = new AudioContextClass();
        console.log('AudioContext created, state:', audioContext.state);

        // Resume AudioContext if suspended (required for some browsers)
        if (audioContext.state === 'suspended') {
            console.log('Resuming AudioContext...');
            await audioContext.resume();
        }

        // Create media stream source
        console.log('Creating MediaStreamSource...');
        if (typeof audioContext.createMediaStreamSource === 'function') {
            microphone = audioContext.createMediaStreamSource(mediaStream);
        } else {
            throw new Error('createMediaStreamSource not available');
        }

        // Create analyser node
        console.log('Creating AnalyserNode...');
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.8;

        // Connect nodes: microphone -> analyser
        microphone.connect(analyser);

        // Initialize data array for frequency data
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Update state
        isListening = true;
        updateButtonStates();
        setStatus('Listening...');
        console.log('Audio capture started successfully');

        // Reset update timestamps
        lastVisualizerUpdate = 0;
        lastDbReadingUpdate = 0;

        // Start the audio processing loop
        processAudio();

    } catch (error) {
        console.error('Audio capture error:', error.name, '-', error.message);
        const errorMsg = getErrorMessage(error);
        setStatus(errorMsg, true); // true = isError, will trigger notification
        stopAudioResources();
        updateButtonStates();
    } finally {
        isProcessingClick = false;
    }
}

/**
 * Stop audio capture and clean up resources
 */
function stopListening() {
    // Edge case: Prevent rapid clicks
    const now = Date.now();
    if (isProcessingClick || (now - lastStartStopClick < MIN_CLICK_INTERVAL)) {
        console.log('Ignoring rapid click');
        return;
    }
    lastStartStopClick = now;
    isProcessingClick = true;

    console.log('Stopping audio capture...');
    stopAudioResources();
    isListening = false;
    updateButtonStates();
    
    // Reset display
    dbValueElement.textContent = '--';
    resetVisualizer();
    resetTheme();
    
    // Reset update timestamps
    lastVisualizerUpdate = 0;
    lastDbReadingUpdate = 0;
    
    setStatus('Ready to listen …');
    console.log('Audio capture stopped');
    isProcessingClick = false;

    // Clear any pending updates
    if (pendingVisualizerUpdate) {
        cancelAnimationFrame(pendingVisualizerUpdate);
        pendingVisualizerUpdate = null;
    }
    if (pendingDbUpdate) {
        clearTimeout(pendingDbUpdate);
        pendingDbUpdate = null;
    }
}

/**
 * Clean up all audio resources
 */
function stopAudioResources() {
    // Cancel animation frame
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // Stop all media tracks
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => {
            track.stop();
            console.log('Stopped track:', track.kind);
        });
        mediaStream = null;
    }

    // Disconnect microphone
    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }

    // Close AudioContext
    if (audioContext) {
        audioContext.close().catch(err => console.warn('AudioContext close error:', err));
        audioContext = null;
    }

    analyser = null;
    dataArray = null;
}

/**
 * Process audio data and update display
 */
function processAudio() {
    if (!isListening) {
        return;
    }

    const now = performance.now();
    let db;
    let normalizedData;

    // Check if sim mode is active
    if (simModeToggle.checked) {
        // Use slider value as dB
        db = parseInt(simSlider.value, 10);
        // Generate fake visualizer data based on dB level
        normalizedData = generateSimVisualizerData(db);
    } else {
        // Use real microphone data
        if (!analyser) {
            animationId = requestAnimationFrame(processAudio);
            return;
        }

        // Get frequency data
        analyser.getByteFrequencyData(dataArray);

        // Convert byte data to normalized float values (0-1)
        normalizedData = new Float32Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
            normalizedData[i] = dataArray[i] / 255;
        }

        // Calculate RMS and dB
        const rms = calculateRMS(normalizedData);
        db = calculateDB(rms);
    }

    // Store current dB for theming
    currentDb = db;

    // Update dB display at specified interval
    if (now - lastDbReadingUpdate >= DB_READING_UPDATE_INTERVAL) {
        updateDbDisplay(db);
        updateTheme(db);
        lastDbReadingUpdate = now;
    }

    // Update visualizer at specified interval
    if (now - lastVisualizerUpdate >= VISUALIZER_UPDATE_INTERVAL) {
        updateVisualizer(normalizedData);
        lastVisualizerUpdate = now;
    }

    // Continue processing loop
    animationId = requestAnimationFrame(processAudio);
}

/**
 * Generate simulated visualizer data based on dB level
 * @param {number} db - Simulated dB value
 * @returns {Float32Array} Simulated normalized data
 */
function generateSimVisualizerData(db) {
    const dataLength = 1024;
    const data = new Float32Array(dataLength);
    const intensity = Math.min(1, Math.max(0, db / 150));
    
    for (let i = 0; i < dataLength; i++) {
        // Create varied bar heights with some randomness
        const base = intensity * 0.7;
        const variation = Math.random() * intensity * 0.3;
        data[i] = base + variation;
    }
    
    return data;
}

// ===========================================
// UI Update Functions
// ===========================================

/**
 * Update the dB reading display
 * @param {number} db - Decibel value
 */
function updateDbDisplay(db) {
    if (db === -Infinity || isNaN(db)) {
        dbValueElement.textContent = '--';
    } else {
        // Clamp dB value for display (reasonable range)
        const clampedDb = Math.max(0, Math.min(150, db));
        dbValueElement.textContent = Math.round(clampedDb);
    }
}

/**
 * Update visualizer bars with audio data
 * @param {Float32Array} data - Normalized audio data
 */
function updateVisualizer(data) {
    const bars = visualizer.querySelectorAll('.bar');
    const step = Math.floor(data.length / 30);

    bars.forEach((bar, index) => {
        const dataIndex = index * step;
        if (dataIndex < data.length) {
            const height = Math.abs(data[dataIndex]) * 200;
            bar.style.height = `${Math.max(2, height)}px`;
        }
    });
}

/**
 * Reset visualizer to initial state
 */
function resetVisualizer() {
    const bars = visualizer.querySelectorAll('.bar');
    bars.forEach(bar => {
        bar.style.height = '2px';
    });
}

// ===========================================
// Theme Functions
// ===========================================

/**
 * Get theme level based on dB value
 * @param {number} db - Decibel value
 * @returns {number} Theme level (0-4)
 */
function getThemeLevel(db) {
    if (db === -Infinity || isNaN(db)) {
        return 0;
    }
    
    for (const threshold of DB_THRESHOLDS) {
        if (db >= threshold.min && db < threshold.max) {
            return threshold.level;
        }
    }
    return 0;
}

/**
 * Update theme based on dB level
 * @param {number} db - Decibel value
 */
function updateTheme(db) {
    const newLevel = getThemeLevel(db);
    
    if (newLevel !== currentThemeLevel) {
        currentThemeLevel = newLevel;
        const assets = THEME_ASSETS[newLevel];
        
        // Update message SVG
        updateMessageSvg(assets.svg);
        
        // Update background with cross-fade
        setBackground(assets.bg);
        
        console.log(`Theme changed to level ${newLevel} (dB: ${Math.round(db)})`);
    }
}

/**
 * Update the message SVG in the message board
 * @param {string} svgUrl - URL of the SVG to display
 */
function updateMessageSvg(svgUrl) {
    if (messageSvg) {
        // Add fade-out effect
        messageSvg.style.opacity = '0';
        
        setTimeout(() => {
            messageSvg.src = svgUrl;
            messageSvg.style.opacity = '1';
        }, 250);
    }
}

/**
 * Set background with cross-fade animation
 * @param {string} imageUrl - URL of the background image
 */
function setBackground(imageUrl) {
    if (isTransitioning) {
        return; // Don't interrupt ongoing transition
    }
    
    const body = document.body;
    
    // Set the new image on ::after
    body.style.setProperty('--next-bg', `url('${imageUrl}')`);
    
    // Trigger cross-fade
    isTransitioning = true;
    body.classList.add('transitioning');
    
    // After transition completes, swap images and reset
    setTimeout(() => {
        body.style.setProperty('--current-bg', `url('${imageUrl}')`);
        body.classList.remove('transitioning');
        isTransitioning = false;
    }, 800); // Match CSS transition duration
}

/**
 * Reset theme to default (level 0)
 */
function resetTheme() {
    currentThemeLevel = 0;
    const assets = THEME_ASSETS[0];
    
    if (messageSvg) {
        messageSvg.src = assets.svg;
        messageSvg.style.opacity = '1';
    }
    
    document.body.style.setProperty('--current-bg', `url('${assets.bg}')`);
    document.body.style.setProperty('--next-bg', `url('${assets.bg}')`);
    document.body.classList.remove('transitioning');
    isTransitioning = false;
}

/**
 * Initialize 30 empty bars in visualizer
 */
function initializeVisualizer() {
    visualizer.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = '2px';
        visualizer.appendChild(bar);
    }
}

/**
 * Update Start/Stop button states
 */
function updateButtonStates() {
    startBtn.disabled = isListening;
    stopBtn.disabled = !isListening;
}

// ===========================================
// Dialog Functions
// ===========================================

/**
 * Toggle Controls Dialog visibility
 */
function toggleDialog() {
    if (controlsDialog.open) {
        controlsDialog.close();
    } else {
        controlsDialog.showModal();
    }
}

/**
 * Handle click outside dialog to close
 */
function handleDialogClick(event) {
    const rect = controlsDialog.getBoundingClientRect();
    const isInDialog = (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
    );
    if (!isInDialog) {
        controlsDialog.close();
    }
}

// ===========================================
// Toggle Functions
// ===========================================

/**
 * Toggle visualizer visibility
 */
function handleVisualizerToggle() {
    visualizer.classList.toggle('hidden', !showVisualizerToggle.checked);
}

/**
 * Toggle dB reading visibility
 */
function handleDbReadingToggle() {
    dbReading.classList.toggle('hidden', !showDbReadingToggle.checked);
}

/**
 * Toggle sim mode
 */
function handleSimModeToggle() {
    const isSimMode = simModeToggle.checked;
    
    // Show/hide the vertical slider container
    simSliderContainer.classList.toggle('hidden', !isSimMode);
    
    if (isSimMode && isListening) {
        // When enabling sim mode while listening, stop microphone but keep "listening" state
        stopMicrophoneOnly();
        setStatus('Sim mode active');
    } else if (!isSimMode && isListening) {
        // When disabling sim mode while listening, restart microphone
        restartMicrophone();
    }
    
    // If sim mode is enabled and we're listening, trigger immediate update
    if (isSimMode && isListening) {
        const db = parseInt(simSlider.value, 10);
        updateDbDisplay(db);
        updateTheme(db);
        updateVisualizer(generateSimVisualizerData(db));
    }
}

/**
 * Stop microphone resources only (keep listening state)
 */
function stopMicrophoneOnly() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }
    if (audioContext) {
        audioContext.close().catch(err => console.warn('AudioContext close error:', err));
        audioContext = null;
    }
    analyser = null;
    dataArray = null;
}

/**
 * Restart microphone capture
 */
async function restartMicrophone() {
    try {
        setStatus('Restarting microphone...');
        
        mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContextClass();
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        microphone = audioContext.createMediaStreamSource(mediaStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.8;
        microphone.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        setStatus('Listening...');
    } catch (error) {
        console.error('Restart microphone error:', error);
        setStatus(getErrorMessage(error));
    }
}

/**
 * Update dB reading display when sim slider changes
 */
function handleSimSliderChange() {
    const db = parseInt(simSlider.value, 10);
    
    // If sim mode is active and listening, update immediately
    if (simModeToggle.checked && isListening) {
        updateDbDisplay(db);
        updateTheme(db);
        updateVisualizer(generateSimVisualizerData(db));
    }
}

// ===========================================
// Event Listeners
// ===========================================

// Dialog controls
gearIcon.addEventListener('click', toggleDialog);
closeDialogBtn.addEventListener('click', () => controlsDialog.close());
controlsDialog.addEventListener('click', handleDialogClick);

// Toggle switches
showVisualizerToggle.addEventListener('change', handleVisualizerToggle);
showDbReadingToggle.addEventListener('change', handleDbReadingToggle);
simModeToggle.addEventListener('change', handleSimModeToggle);
simSlider.addEventListener('input', handleSimSliderChange);

// Audio controls
startBtn.addEventListener('click', startListening);
stopBtn.addEventListener('click', stopListening);

// ===========================================
// Initialization
// ===========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeVisualizer();
    updateButtonStates();
    preloadAssets();
    registerServiceWorker();
    requestNotificationPermission();
    setupImageErrorHandlers();
    console.log('dBwatch initialized (Stage 5 - Polish & Integration)');
});

// Handle page visibility changes (pause/resume when tab hidden/visible)
let wasListeningBeforeHidden = false;
let audioContextWasSuspended = false;

document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
        // Tab hidden - pause audio processing to save resources
        if (isListening && audioContext) {
            wasListeningBeforeHidden = true;
            audioContextWasSuspended = audioContext.state !== 'suspended';
            
            // Cancel animation frame to stop processing
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            console.log('Tab hidden, audio processing paused');
        }
    } else {
        // Tab visible - resume audio processing
        if (wasListeningBeforeHidden && audioContext) {
            // Resume AudioContext if it was suspended
            if (audioContext.state === 'suspended' && audioContextWasSuspended) {
                try {
                    await audioContext.resume();
                    console.log('AudioContext resumed');
                } catch (error) {
                    console.warn('Failed to resume AudioContext:', error);
                }
            }
            
            // Restart processing loop
            if (!animationId) {
                processAudio();
            }
            console.log('Tab visible, audio processing resumed');
        }
        wasListeningBeforeHidden = false;
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (isListening) {
        stopAudioResources();
    }
});

// Handle AudioContext state changes
function handleAudioContextStateChange() {
    if (!audioContext) return;
    
    console.log('AudioContext state changed:', audioContext.state);
    
    if (audioContext.state === 'suspended' && isListening && !simModeToggle.checked) {
        setStatus('Audio paused. Click to resume.');
        // Try to resume on next user interaction
        document.addEventListener('click', resumeAudioContext, { once: true });
    }
}

async function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            if (isListening) {
                setStatus('Listening...');
            }
        } catch (error) {
            console.warn('Failed to resume AudioContext:', error);
        }
    }
}

// ===========================================
// Asset Preloading & Error Handling
// ===========================================

/**
 * Preload theme assets to ensure smooth transitions
 */
function preloadAssets() {
    const assets = Object.values(THEME_ASSETS);
    
    assets.forEach(({ svg, bg }) => {
        // Preload SVG
        const svgImg = new Image();
        svgImg.src = svg;
        
        // Preload background image
        const bgImg = new Image();
        bgImg.src = bg;
    });
    
    console.log('Assets preloading initiated');
}

/**
 * Setup error handlers for the message SVG image
 */
function setupImageErrorHandlers() {
    if (messageSvg) {
        messageSvg.addEventListener('error', (event) => {
            console.warn('Failed to load SVG:', event.target.src);
            // Fallback: hide the broken image
            event.target.style.display = 'none';
            // Optionally show a text fallback
            const fallbackText = document.createElement('p');
            fallbackText.textContent = 'dB Watch';
            fallbackText.className = 'fallback-text';
            messageSvg.parentElement.appendChild(fallbackText);
        });
        
        messageSvg.addEventListener('load', () => {
            messageSvg.style.display = '';
            // Remove any fallback text
            const fallback = messageSvg.parentElement.querySelector('.fallback-text');
            if (fallback) fallback.remove();
        });
    }
}

// ===========================================
// Service Worker Registration
// ===========================================

let swRegistration = null;
let newWorkerWaiting = null;

/**
 * Register the service worker for PWA functionality
 */
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            swRegistration = await navigator.serviceWorker.register('./sw.js', {
                scope: './'
            });
            
            console.log('[PWA] Service Worker registered successfully');
            console.log('[PWA] Scope:', swRegistration.scope);
            
            // Check for updates periodically
            setInterval(() => {
                swRegistration.update();
            }, 60 * 60 * 1000); // Check every hour
            
            // Check for updates
            swRegistration.addEventListener('updatefound', () => {
                const newWorker = swRegistration.installing;
                console.log('[PWA] New service worker installing...');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[PWA] New content available, showing update notification');
                        newWorkerWaiting = newWorker;
                        showUpdateNotification();
                    }
                });
            });

            // Handle controller change (when SW takes over)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[PWA] Controller changed, reloading...');
                window.location.reload();
            });
            
        } catch (error) {
            console.error('[PWA] Service Worker registration failed:', error);
            setStatus('PWA registration failed', true);
        }
    } else {
        console.log('[PWA] Service Workers not supported');
    }
}

/**
 * Show update notification banner
 */
function showUpdateNotification() {
    const banner = document.getElementById('update_banner');
    if (banner) {
        banner.classList.add('visible');
    }
}

/**
 * Hide update notification banner
 */
function hideUpdateNotification() {
    const banner = document.getElementById('update_banner');
    if (banner) {
        banner.classList.remove('visible');
    }
}

/**
 * Apply the service worker update
 */
function applyUpdate() {
    if (newWorkerWaiting) {
        newWorkerWaiting.postMessage({ type: 'SKIP_WAITING' });
        hideUpdateNotification();
    }
}

// Expose applyUpdate for the update banner button
window.applyUpdate = applyUpdate;