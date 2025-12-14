# dBwatch PWA — Multi-Stage Development Plan

This plan breaks the dBwatch PWA into **5 development stages**, each with its own prompt file. The stages progress from foundational setup to full PWA functionality, allowing incremental testing and validation at each milestone.

---

## Stages Overview

| Stage | Focus | Key Deliverables |
|-------|-------|------------------|
| 1 | **Project Foundation** | `src/` folder, `index.html`, `styles.css`, basic layout matching mocks |
| 2 | **Audio Engine** | `app.js` with microphone access, RMS/dB calculation, error handling |
| 3 | **UI Interactivity** | Controls dialog, visualizer, dB reading, sim mode, dynamic theming |
| 4 | **PWA Setup** | `manifest.json`, `sw.js`, icons, installability, offline support |
| 5 | **Polish & Integration** | Notifications, final testing, edge cases, performance tuning |

---

## Stage 1: Project Foundation

**Goal:** Create the basic HTML structure and CSS layout matching the design mocks.

**Deliverables:**
- `src/index.html` — Main HTML with semantic structure
- `src/styles.css` — Full styling matching `./plan/dBwatch_main.png` and `./plan/dBwatch_control.png`

**Key Elements:**
- `#message_board` — Center area for SVG messages
- `#dBreading` — Bottom-left dB display (show `--` initially)
- `#visualizer` — Green bars audio visualizer (bottom area)
- Gear icon (top-left) — Tooltip "Controls"
- `#controls_dialog` — Floating dialog (hidden by default)
- Initial background: `./media/background_image_0.png`
- Initial message: `./media/welcom_logo.svg`

**Acceptance Criteria:**
- [ ] Page loads with correct layout matching mocks
- [ ] Background image displays correctly
- [ ] Welcome SVG displays in message board
- [ ] dB reading shows `--` with small "dB" suffix
- [ ] Visualizer area visible (empty/zero bars)
- [ ] Gear icon visible and styled
- [ ] Controls dialog structure present (hidden)

---

## Stage 2: Audio Engine

**Goal:** Implement microphone access and dB calculation logic.

**Deliverables:**
- `src/app.js` — Core audio processing module

**Key Patterns from `dbTester.html`:**
```javascript
// Audio pipeline
getUserMedia → AudioContext → MediaStreamSource → AnalyserNode → FFT Data

// Configuration
const FFT_SIZE = 2048;
const constraints = { 
  echoCancellation: false, 
  noiseSuppression: false, 
  autoGainControl: false 
};

// dB Calculation
function calculateRMS(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

function calculateDB(rms, reference = 0.00001) {
  if (rms > 0) {
    return 20 * Math.log10(rms / reference);
  }
  return -Infinity;
}
```

**Error Handling:**
| Error Name | User Message |
|------------|--------------|
| `NotAllowedError` | "Microphone permission denied. Please allow access." |
| `NotFoundError` | "No microphone found on this device." |
| `NotReadableError` | "Microphone is in use by another app." |
| `SecurityError` | "Security error. Try serving over HTTPS or localhost." |

**Acceptance Criteria:**
- [ ] AudioContext initializes correctly
- [ ] Microphone permission requested on Start
- [ ] RMS and dB values calculated from audio stream
- [ ] Proper error messages for all failure scenarios
- [ ] Resources cleaned up on Stop (tracks stopped, nodes disconnected)

---

## Stage 3: UI Interactivity

**Goal:** Connect audio engine to UI, implement controls dialog functionality.

**Deliverables:**
- Updated `src/app.js` with UI bindings
- Updated `src/styles.css` for interactive states

**Controls Dialog Features:**
- **Show visualizer** toggle (checkbox, default ON)
- **Show dB reading** toggle (checkbox, default ON)
- **Sim mode** checkbox + slider (0–150 dB) + numeric display
  - When ON: use slider value instead of microphone
  - When OFF: slider disabled/greyed, resume microphone
  - Default: 0 dB
- **Status messages** area (default: "Ready to listen …")
- **Start Listening** button → begins capture, shows "Listening..."
- **Stop Listening** button → disabled initially, stops capture, shows "Ready to listen …"

**Update Frequencies:**
- Visualizer: every **0.5s** (500ms)
- dB reading: every **2s** (2000ms)

**Visualizer Style:**

Reuse the `updateVisualizer` function pattern from `./plan/dbTester.html`:

```javascript
function updateVisualizer(data) {
    visualizer.innerHTML = '';
    const step = Math.floor(data.length / 30);  // Use 30 bars
   
    for (let i = 0; i < data.length; i += step) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        const height = (Math.abs(data[i]) * 200);
        bar.style.height = `${Math.max(2, height)}px`;
        visualizer.appendChild(bar);
    }
}
```

**Visualizer CSS Requirements:**
- **Number of bars:** 30
- **Bar fill:** `lightgreen` solid color (no gradient)
- **Bar border:** `1px solid yellow`
- **Animation smoothness:** Use CSS transition for height changes: `transition: height 0.3s ease`
- **Layout:** Flexbox with `gap: 2px`, aligned to bottom

```css
.visualizer {
    display: flex;
    gap: 2px;
    height: 40px;
    align-items: flex-end;
}

.bar {
    flex: 1;
    background: lightgreen;
    border: 1px solid yellow;
    border-radius: 3px;
    min-height: 2px;
    transition: height 0.3s ease;  /* Smooth animation */
}
```

**Dynamic Theming by dB Level:**
| dB Range | Message SVG | Background Image |
|----------|-------------|------------------|
| < 70 | `welcom_logo.svg` | `background_image_0.png` |
| 70–85 | `noise_level_msg_1.svg` | `background_image_1.png` |
| 85–100 | `noise_level_msg_2.svg` | `background_image_2.png` |
| 100–120 | `noise_level_msg_3.svg` | `background_image_3.png` |
| > 120 | `noise_level_msg_4.svg` | `background_image_4.png` |

**Background Image Transition (Cross-Fade Animation):**

Use CSS pseudo-elements (`::before` / `::after`) to achieve smooth cross-fade transitions between background images when dB thresholds change.

**CSS Structure:**
```css
body {
    position: relative;
    min-height: 100vh;
}

body::before,
body::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-size: cover;
    background-position: center;
    transition: opacity 0.8s ease-in-out;
    z-index: -1;
}

body::before {
    /* Current background - always visible */
    background-image: var(--current-bg);
    opacity: 1;
}

body::after {
    /* Next background - fades in during transition */
    background-image: var(--next-bg);
    opacity: 0;
}

/* Transition state: swap opacity to cross-fade */
body.transitioning::before {
    opacity: 0;
}

body.transitioning::after {
    opacity: 1;
}
```

**CSS Variables for Background Images:**
```css
body {
    --current-bg: url('./media/background_image_0.png');
    --next-bg: url('./media/background_image_0.png');
}
```

**JavaScript Implementation:**
```javascript
function setBackground(imageUrl) {
    const body = document.body;
    
    // Set the new image on ::after
    body.style.setProperty('--next-bg', `url(${imageUrl})`);
    
    // Trigger cross-fade
    body.classList.add('transitioning');
    
    // After transition completes, swap images and reset
    setTimeout(() => {
        body.style.setProperty('--current-bg', `url(${imageUrl})`);
        body.classList.remove('transitioning');
    }, 800);  // Match CSS transition duration
}
```

**Acceptance Criteria:**
- [ ] Gear icon toggles controls dialog visibility
- [ ] Start/Stop buttons work correctly with state management
- [ ] Visualizer updates every 0.5s when listening
- [ ] dB reading updates every 2s when listening
- [ ] Sim mode overrides microphone input
- [ ] Sim slider disabled when sim mode OFF
- [ ] Background and message SVG change at correct thresholds
- [ ] Toggles hide/show visualizer and dB reading
- [ ] Status messages update appropriately

---

## Stage 4: PWA Setup

**Goal:** Make the app installable and work offline.

**Deliverables:**
- `src/sw.js` — Service Worker with caching

**Existing Assets (DO NOT recreate):**
- Use the existing manifest at `./manifest.json` (project root)
- Use the existing icons from `./icons/` folder (contains sizes: 48x48, 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 256x256, 384x384, 512x512)

**Manifest Integration:**

The project already has a `manifest.json` at the root level with the following configuration:
```json
{
  "name": "dB Watch",
  "short_name": "dBwatch",
  "icons": [
    { "src": "icons/icon-48x48.png", "sizes": "48x48", "type": "image/png" },
    { "src": "icons/icon-72x72.png", "sizes": "72x72", "type": "image/png" },
    { "src": "icons/icon-96x96.png", "sizes": "96x96", "type": "image/png" },
    { "src": "icons/icon-128x128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "icons/icon-144x144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "icons/icon-152x152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-256x256.png", "sizes": "256x256", "type": "image/png" },
    { "src": "icons/icon-384x384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000"
}
```

**Note:** Update `start_url` in the manifest to `"./src/index.html"` or adjust based on final deployment structure.

Link the manifest in `src/index.html`:
```html
<link rel="manifest" href="../manifest.json">
```

**Service Worker Caching:**
- Cache all static assets (HTML, CSS, JS, images, SVGs)
- Cache-first strategy for assets
- Network-first for API calls (if any)
- Offline fallback behavior

**Acceptance Criteria:**
- [ ] Manifest linked in HTML `<head>`
- [ ] Service worker registered on page load
- [ ] Browser shows "Install" prompt on supported browsers
- [ ] App installs to desktop with correct name and icon
- [ ] App works offline (shows cached content)
- [ ] `display: standalone` removes browser chrome

---

## Stage 5: Polish & Integration

**Goal:** Final refinements, notifications, edge cases, performance.

**Deliverables:**
- Notifications permission and usage
- Edge case handling
- Performance optimizations
- Final testing checklist

**Notifications:**
- Request permission at app start
- **Use ONLY for error notifications** (e.g., microphone access errors, AudioContext failures)
- **Do NOT use notifications for dB threshold crossings** — visual theming changes are sufficient for level feedback
- Handle permission denied gracefully (app should function without notifications)

**Edge Cases:**
- [ ] Multiple rapid Start/Stop clicks
- [ ] Browser tab hidden/visible (pause/resume)
- [ ] AudioContext suspended state handling
- [ ] Very low/high dB values (clamp display)
- [ ] SVG/image load failures (fallbacks)
- [ ] Service worker update handling

**Performance:**
- [ ] Debounce/throttle UI updates
- [ ] Efficient DOM updates (batch changes)
- [ ] Memory leak prevention (cleanup listeners)
- [ ] Lazy load non-critical assets

**Final Testing Checklist:**
- [ ] Chrome desktop — install and run
- [ ] Edge desktop — install and run
- [ ] Firefox desktop — run (no install)
- [ ] Mobile Chrome — install and run
- [ ] Offline mode — all features degrade gracefully
- [ ] Permission denied — proper error messages
- [ ] Sim mode — all threshold levels display correctly

---

## Prompt Files to Generate

When ready to implement each stage, use these prompt files:

1. `plan/stage_1_foundation.md` — HTML structure, CSS layout, static assets
2. `plan/stage_2_audio_engine.md` — AudioContext, getUserMedia, dB calculation
3. `plan/stage_3_ui_interactivity.md` — Controls dialog, visualizer, sim mode, theming
4. `plan/stage_4_pwa_setup.md` — Manifest, service worker, icons, installability
5. `plan/stage_5_polish.md` — Notifications, edge cases, performance, final testing

---

## Open Questions — RESOLVED

1. **PWA Icons**: ✅ Use existing icons from `./icons/` folder (10 sizes available: 48x48 through 512x512)
2. **Notification Triggers**: ✅ Fire only for errors (microphone access, AudioContext failures). Do NOT use for dB threshold crossings.
3. **Visualizer Style**: ✅ Use 30 bars with `lightgreen` solid fill, `yellow` borders, and smooth CSS transitions (`transition: height 0.3s ease`). Reference `updateVisualizer` function from `./plan/dbTester.html`.
