
# dBwatch v2.0 — Refactor & PWA Enhancement Plan

**File name:** `dbWatch-V2-Refactor-plan.prompt.md`  
**Context:** Continuation of `.github/prompts/dbWatch-Development-plan.prompt.md` for use with **GitHub Copilot** in VS Code (Agent mode).  
**Goal:** Deliver dBwatch v2.0 with UI refinements, PWA correctness, and DotLottie-based animations while preserving the existing functionality and visual fidelity of **Controls dialog**, **visualizer**, and **dBreading**.

---

## Golden Rules
- Do **not** alter or hide elements defined in `.github/prompts/dbWatch-Development-plan.prompt.md` except where explicitly instructed below.  
- Ensure **Controls**, **visualizer**, and **dBreading** remain fully functional and unobstructed by new UI or logic.  
- Keep changes incremental; each stage concludes with acceptance criteria and a small regression suite.  
- Use relative paths exactly as referenced here; assume files exist in the workspace.

---

## Current Project Structure Reference
```
./manifest.json          # PWA manifest (root)
./icons/                 # PWA icons folder
./media/                 # Animation JSON files and assets
./src/index.html         # Main HTML file (to be moved)
./src/app.js             # Main application logic
./src/styles.css         # Application styles
./src/sw.js              # Service Worker
./src/dotlottie-web.js   # DotLottie animation library
./plan/                  # Planning documents
```

---

## Stage 0 — Preparation & Safety
**Tasks**
1. Create a working branch: `feature/dbwatch-v2-refactor`.
2. Snapshot current app: `git tag pre-v2-baseline`.
3. Search codebase for references to `index.html`, `manifest.json`, `message_board`, background images, and `controls_dialog`.

**Acceptance Criteria**
- [ ] Branch exists; baseline tag created.
- [ ] A simple inventory (VS Code search results saved in `plan/search-inventory.txt`).

---

## Stage 1 — Move `index.html` to project root
**Tasks**
1. Relocate `src/index.html` → `./index.html` (root).  
2. Update all relative references from `index.html` to scripts/styles/assets:
   - Scripts: `./src/app.js`, `./src/dotlottie-web.js`
   - Styles: `./src/styles.css`
   - Manifest: `./manifest.json`
   - Icons: `./icons/` (update apple-touch-icon paths)
   - Media: `./media/` (update SVG/image paths)
3. Update `./manifest.json`:
   - Change `"start_url": "./src/index.html"` → `"start_url": "./index.html"`
4. Update Service Worker registration path in `./src/app.js`:
   - Change from `navigator.serviceWorker.register('./sw.js')` → `navigator.serviceWorker.register('./src/sw.js')`
5. Update `./src/sw.js` cache list to reflect new paths (e.g., `./index.html` instead of `./src/index.html`).

**Reference snippet — Updated paths in index.html**
```html
<!-- After moving to root -->
<link rel="manifest" href="./manifest.json">
<link rel="stylesheet" href="./src/styles.css">
<link rel="apple-touch-icon" href="./icons/icon-152x152.png">
<script src="./src/app.js" type="module"></script>
```

**Acceptance Criteria**
- [ ] `index.html` is at project root.
- [ ] `manifest.json` `start_url` updated to `"./index.html"`.
- [ ] All relative paths in `index.html` correctly point to `./src/`, `./icons/`, `./media/`.
- [ ] Service Worker registration path updated in `./src/app.js`.
- [ ] Service Worker cache list updated in `./src/sw.js`.
- [ ] App runs locally with `index.html` at root; no 404s for JS/CSS/icons/manifest.
- [ ] PWA install prompt still works; Service Worker is **activated**.

---

## Stage 2 — Manifest version key
**Tasks**
1. Edit `./manifest.json`: add `"version": "2.0"` (keep existing keys intact).
2. Confirm JSON validity.

**Acceptance Criteria**
- [ ] `manifest.json` loads without errors; `version` is retrievable by `fetch('./manifest.json')`.
- [ ] App runs locally with `index.html` at root; no 404s for JS/CSS/icons/manifest.
- [ ] PWA install prompt still works; Service Worker is **activated**.

---

## Stage 3 — Controls dialog version label
**Tasks**
1. In the **Controls** dialog markup, directly under the dialog title, add a small text: `( version: {{version}} )`.  
   - Implement runtime injection by loading `manifest.json` and replacing `{{version}}` with `manifest.version`.
2. Styling: small font, muted color (e.g., `opacity: 0.7; font-size: 0.8rem;`).

**Reference snippet**
```html
<!-- Under Controls dialog title -->
<div id="controls_version" aria-live="polite" style="opacity:0.7;font-size:0.8rem">( version: {{version}} )</div>
```
```js
// controls-version.js (or place in an existing bootstrap module)
async function attachVersionLabel() {
  try {
    const res = await fetch('./manifest.json');
    const manifest = await res.json();
    const el = document.getElementById('controls_version');
    if (el && manifest.version) {
      el.textContent = `( version: ${manifest.version} )`;
    }
  } catch (e) {
    console.warn('Version label: manifest not found or invalid', e);
  }
}
attachVersionLabel();
```

**Acceptance Criteria**
- [ ] Version text appears under the Controls dialog title and reads `( version: 2.0 )`.
- [ ] No layout shifts; dialog remains fully usable.

---

## Stage 4 — Gear icon behavior (top-left)
**Tasks**
1. Keep the gear icon fixed at the **top-left** and bound to opening **Controls**.
2. Auto-hide logic: if `controls_dialog` is **hidden**, hide the gear **after 2 seconds**.
3. Hover-to-show: reveal gear when the cursor hovers over its hit area; hide again on mouse leave if controls remain hidden.
4. Implement with CSS classes (`.gear--hidden { opacity:0; pointer-events:none; }`) and timers.

**Reference snippet**
```html
<button id="controls_gear" aria-label="Controls" class="gear">⚙️</button>
```
```css
.gear{position:fixed;top:8px;left:8px;z-index:1000;transition:opacity .2s}
.gear--hidden{opacity:0;pointer-events:none}
.gear-hit{position:fixed;top:0;left:0;width:48px;height:48px;z-index:999}
```
```js
const gear = document.getElementById('controls_gear');
const hit = document.createElement('div');
hit.className = 'gear-hit';
document.body.appendChild(hit);
let hideTimer;

function scheduleAutoHide(){
  clearTimeout(hideTimer);
  // Only schedule if controls are hidden
  const controlsHidden = !document.getElementById('controls_dialog')?.offsetParent;
  if (controlsHidden) hideTimer = setTimeout(()=> gear.classList.add('gear--hidden'), 4000);
}

hit.addEventListener('mouseenter',()=> gear.classList.remove('gear--hidden'));
hit.addEventListener('mouseleave',scheduleAutoHide);
scheduleAutoHide();
```

**Acceptance Criteria**
- [ ] Gear stays visible initially; hides ~4s after Controls are closed; reappears on hover; opens Controls on click.
- [ ] **visualizer** and **dBreading** are not covered (z-index verified).

---

## Stage 5 — Remove `message_board` and unify background
**Tasks**
1. Remove the `message_board` element and its references (HTML/CSS/JS).
2. remove all associated styles/scripts calls to `message_board` id.
3. Detach backgrounds `background_image_1.png` … `background_image_4.png` from screen styles.
4. Keep **only** `background_image_0.png` as the default background.
5. fix functionality to ensure the screen background not changed dynamically and the change bacground image and 'message_board' features are fully removed.
6. Ensure the background sits **below** the upcoming canvas.

**Acceptance Criteria**
- [ ] No DOM or CSS references to `message_board` remain.
- [ ] The app displays `background_image_0.png` solely; no flicker.

---

## Stage 6 — Add full-screen `main_canvas`
**Tasks**
1. Create the `./src/animations/` folder for animation modules.
2. Add `<canvas id="main_canvas"></canvas>` centered, spanning full viewport, layered **above** the background, **behind** interactive dialogs.
3. CSS: absolute/full-bleed; responsive.
4. Create `./src/animations/bootstrap.js` to initialize animation system using `./src/dotlottie-web.js` and the example in `./plan/dotlottie-web-example.html`.
5. **Initial state:** render `./media/state_1.json` into `main_canvas`.

**Reference snippet**
```html
<!-- index.html -->
<canvas id="main_canvas" aria-hidden="true"></canvas>
```
```css
#main_canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:10}
/* Ensure Controls/visualizer/dBreading are above */
.controls, #controls_dialog, .visualizer, .dbreading{position:relative;z-index:20}
```
```js
// src/animations/bootstrap.js (create ./src/animations/ folder first)
import { DotLottie } from '../dotlottie-web.js';

export const canvas = document.getElementById('main_canvas');
export let player = new DotLottie({
  canvas,
  autoplay: true,
  loop: false,
  mode: 'forward',
  src: './media/state_1.json' // Initial state
});
```

**Acceptance Criteria**
- [ ] `./src/animations/` folder created.
- [ ] `./src/animations/bootstrap.js` created with DotLottie player initialization.
- [ ] `main_canvas` covers the viewport and displays `state_1.json`.
- [ ] Controls/visualizer/dBreading remain clickable/usable.

---

## Stage 7 — Animation data model for transitions & states
**Tasks**
1. Create `./src/animations/model.js` with a data structure capturing transition files, their `durationMs`, playback **mode**, and target state JSON (these durations must be the single source of truth for any delay logic in Stage 8).
2. Provide helper functions to: (a) determine the current *range* from `dBreading`, (b) compute transition direction based on previous range, (c) load transition and then load steady state (return both the transition config and its `durationMs` so callers can await dynamically).

**Example**
```js
// src/animations/model.js
export const ranges = {
  S1: { label: '<70dB', test: v => v < 70 },
  S2: { label: '70–85dB', test: v => v >= 70 && v < 85 },
  S3: { label: '85–100dB', test: v => v >= 85 && v < 100 },
  S4: { label: '100–120dB', test: v => v >= 100 && v < 120 }
  S5: { label: '120dB<', test: v => v >= 120 }
};

export const files = {
  state: {
    S1: { file: './media/state_1.json', mode: 'forward' },
    S2: { file: './media/state_2.json', mode: 'forward' },
    S3: { file: './media/state_3.json', mode: 'forward' },
    S4: { file: './media/state_4.json', mode: 'forward' },
    S5: { file: './media/state_5.json', mode: 'forward' }
  },
  transition: {
    S1_S2: { file: './media/transition_1_2.json', durationMs: 2000 },
    S2_S3: { file: './media/transition_2_3.json', durationMs: 2000 },
    S3_S4: { file: './media/transition_3_4.json', durationMs: 2000 },
    S4_S5: { file: './media/transition_4_5.json', durationMs: 2000 }
  }
};

export function classify(v){
  if (ranges.S1.test(v)) return 'S1';
  if (ranges.S2.test(v)) return 'S2';
  if (ranges.S3.test(v)) return 'S3';
  if (ranges.S4.test(v)) return 'S4';
  return 'S5';
}
```

**Acceptance Criteria**
- [ ] `./src/animations/model.js` created with ranges and files data structures.
- [ ] `classify()` function correctly maps dB values to states S1–S5.

---

## Stage 8 — Transition controller driven by `dBreading`
**Tasks**
1. Create `./src/animations/controller.js` to handle animation transitions.
2. Wire into the existing `dBreading` update stream (without modifying its behavior).
3. On each reading, decide the new range vs. previous range and execute the specified behavior while honoring the `durationMs` defined in Stage 7 (no hard-coded delays):
  - **Prev ≥70dB → Now <70dB:** play `transition_1_2.json` in **reverse**, then steady `state_1.json` in **forward** after its configured delay.
  - **Prev <70dB → Now 70–85dB:** play `transition_1_2.json` in **forward**, then steady `state_2.json` in **forward** after its configured delay.
  - **Prev >85dB → Now 70–85dB:** play `transition_1_2.json` in **reverse**, then steady `state_2.json` in **forward** after its configured delay.
  - **Prev <85dB → Now 85–100dB:** play `transition_2_3.json` in **forward**, then steady `state_3.json` in **forward** after its configured delay.
  - **Prev >100dB → Now 85–100dB:** play `transition_2_3.json` in **reverse**, then steady `state_3.json` in **forward** after its configured delay.
  - **Prev <100dB → Now 100–120dB:** play `transition_3_4.json` in **forward**, then steady `state_4.json` in **forward** after its configured delay.

**Reference snippet**
```js
// src/animations/controller.js
import { player, canvas } from './bootstrap.js';
import { files, classify } from './model.js';

let prevRange = 'S1';

export async function onReading(dbValue){
  const nextRange = classify(dbValue);
  if (nextRange === prevRange) return; // no change

  const txKey = `${['S1','S2','S3','S4'].indexOf(prevRange) < ['S1','S2','S3','S4'].indexOf(nextRange) ? prevRange : nextRange}_${['S1','S2','S3','S4'].indexOf(prevRange) < ['S1','S2','S3','S4'].indexOf(nextRange) ? nextRange : prevRange}`;
  let transitionFile, transitionMode, transitionDuration;

  // Map exact transitions per spec
  if (prevRange==='S2' && nextRange==='S1') { transitionFile = files.transition.S1_S2.file; transitionMode='reverse'; transitionDuration = files.transition.S1_S2.durationMs; }
  else if (prevRange==='S1' && nextRange==='S2') { transitionFile = files.transition.S1_S2.file; transitionMode='forward'; transitionDuration = files.transition.S1_S2.durationMs; }
  else if (prevRange==='S3' && nextRange==='S2') { transitionFile = files.transition.S2_S3.file; transitionMode='reverse'; transitionDuration = files.transition.S2_S3.durationMs; }
  else if (prevRange==='S2' && nextRange==='S3') { transitionFile = files.transition.S2_S3.file; transitionMode='forward'; transitionDuration = files.transition.S2_S3.durationMs; }
  else if (prevRange==='S4' && nextRange==='S3') { transitionFile = files.transition.S3_S4.file; transitionMode='reverse'; transitionDuration = files.transition.S3_S4.durationMs; }
  else if (prevRange==='S3' && nextRange==='S4') { transitionFile = files.transition.S3_S4.file; transitionMode='forward'; transitionDuration = files.transition.S3_S4.durationMs; }
  else { prevRange = nextRange; return; }

  const delay = transitionDuration ?? 2000;

  // Play transition using the configured duration
  await player.load({ src: transitionFile, autoplay: true, loop: false, mode: transitionMode });
  setTimeout(async ()=>{
    const steady = files.state[nextRange];
    await player.load({ src: steady.file, autoplay: true, loop: false, mode: steady.mode });
  }, delay);

  prevRange = nextRange;
}
```

**Notes**
- `mode` accepts `'forward' | 'reverse' | 'bounce' | 'reverse-bounce'`; use `'forward'` or `'reverse'` per rules.
- Prefer `player.load({ src, autoplay, loop, mode })` to swap animations.

**Acceptance Criteria**
- [ ] `./src/animations/controller.js` created with `onReading()` export.
- [ ] Manually feed readings to `onReading()` (e.g., `60 → 75 → 90 → 105 → 95 → 80 → 65`) and confirm transitions and steady states follow the spec.
- [ ] No UI overlap with Controls/visualizer/dBreading.

---

## Stage 9 — Regression: preserve existing UI/behavior
**Tasks**
1. Inspect the app with the Controls dialog opened/closed.
2. Verify visualizer updates are unaffected by the canvas.
3. Confirm dBreading display/logic behaves as before (our controller only mirrors its value; it does not modify its internals).
4. Make sure that no jumps to the animation occur when the state skips (e.g., from S1 to S3 directly) when the dB reading jumps the animation should still play the corrent transitions up or down to the final stets (e.g. from S1 → S2 transition then S2 → S3 transition).

**Acceptance Criteria**
- [ ] No CSS stacking issues; dialogs remain clickable.
- [ ] No console errors; FPS remains acceptable.
- [ ] No animation skips or glitches during rapid dBreading changes.

---

## Stage 10 — PWA & performance checks
**Tasks**
1. Lighthouse PWA audit: installability, offline support, manifest correctness.
2. Verify Service Worker (`./src/sw.js`) continues to cache `./manifest.json`, `./index.html`, `./media/*.json` as appropriate.
3. Measure animation impact; consider `renderConfig.freezeOnOffscreen=true` and `autoResize=true` if needed.

**Acceptance Criteria**
- [ ] Lighthouse PWA passes; no regressions.

---

## Stage 11 — Commit discipline & delivery
**Tasks**
1. Commit per stage with messages like `feat(pwa): move index.html to root` / `feat(animations): add main_canvas and controller`.
2. Open PR and summarize changes against `.github/prompts/dbWatch-Development-plan.prompt.md`.
3. Tag `v2.0.0-rc.1` and prepare release notes.

---

## Agent Hints (GitHub Copilot in VS Code)
- Use inline code actions to update paths in `./index.html` after relocation.
- Generate `./src/animations/*` modules and wire imports where bootstrap code runs.
- Keep search-and-replace **scoped** (limit to HTML/CSS/JS, exclude docs/tests).

---

## References (for developers)
- DotLottie Web — API config (constructor `mode`, `canvas`, `src`, etc.): https://developers.lottiefiles.com/docs/dotlottie-player/dotlottie-web/api/config/  
- DotLottie Web — Usage & Getting Started: https://developers.lottiefiles.com/docs/dotlottie-player/dotlottie-web/  
- DotLottie Web — Methods (`setMode`, `load`, etc.): https://developers.lottiefiles.com/docs/dotlottie-player/dotlottie-web/methods/

---

## Quick Test Script (manual)
```js
// Simulate dBreading values (run in DevTools console)
import { onReading } from './src/animations/controller.js';
[60, 75, 90, 105, 95, 80, 65].forEach((v,i)=> setTimeout(()=> onReading(v), i*2500));
```

