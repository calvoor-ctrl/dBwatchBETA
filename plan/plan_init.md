
# dBwatch — Progressive Web App (PWA) Engineering Plan

This plan is written to kick off development in **VS Code** with **GitHub Copilot**. It defines the architecture, files, implementation steps, prompts, and acceptance criteria for building the **dBwatch** PWA. All referenced assets are assumed to exist with the given **relative paths**.

> **Key assets provided (assumed present):**  
> - `./plan/dBwatch_main.png` (main screen mock)  
> - `./plan/dBwatch_control.png` ((main screen mock + controls dialog mock)  
> - `./plan/dbTester.html` (internal demo script; use portions of its logic)  
> - `./media/welcom_logo.svg`  
> - `./media/noise_level_msg_1.svg` … `./media/noise_level_msg_4.svg`  
> - `./media/background_image_0.png` … `./media/background_image_4.png`

---

## 1) Product Overview

**Name:** `dBwatch`  
**Type:** Progressive Web App (PWA)  
**Goal:** Measure and visualize sound levels (estimated dB) using the computer’s microphone and present a simple UI with a dynamic message area, an audio visualizer, and controls. The app is **installable** from the browser to desktop, works offline (with limited behavior), and manages permissions robustly.

---

## 2) High-Level Requirements

1. **Installable PWA** from the browser to desktop (manifest + service worker; `display: standalone`).
2. **Microphone access** via `navigator.mediaDevices.getUserMedia({ audio: true })`.
3. **Permission and error handling**:
   - Microphone not available, permission denied, errors during capture.
   - Request **Notifications** permission at app start; use notification messages as needed.
   - Show concise status messages inside the **`controls_dialog`**.
4. **Main screen** follows `./plan/dBwatch_main.png`:
   - Center **message board** area (`id="message_board"`) that displays SVG loaded from the file system.
   - Initial background image: `./media/background_image_0.png`.
   - Bottom-left **dB reading** (`id="dBreading"`): latest (or averaged) dB value updated every **2s**; show `--` if missing/invalid; display small "dB" to the right of the number.
   - Green bars **audio visualizer** (`id="visualizer"`): updated every **0.5s** with recent microphone amplitude frames. When not listening, render zero bars.
   - Top-left **gear icon** (tooltip **"Controls"**) toggles the floating **`controls_dialog`** (see `./plan/dBwatch_control.png`).
5. **Controls dialog** (`id="controls_dialog"`):
   - Toggle **Show visualizer** (checkbox; default **ON**).
   - Toggle **Show dB reading** (checkbox; default **ON**).
   - **Sim mode** checkbox + slider (0–150 dB) and numeric display: when ON, app uses the fixed simulated dB; when OFF, slider is disabled/greyed and app resumes microphone sampling. Default simulated value **0 dB**.
   - Status messages area (default message: `Ready to listen …`).
   - **Start Listening** button: begins continuous capture/sampling (2048 samples per window); requests permissions as needed; surfaces errors in the dialog status messages area. If listen started with no errors write: `Listening...` in the Status messages area.
   - **Stop Listening** button: initially disabled; becomes enabled after start; stops capture and re-enables Start. if pressed write back: `Ready to listen ...` in the Status messages area.
6. **Frequency of updates**:
   - Visualizer: **every 0.5s**.
   - dB reading: **every 2s**, computed from a buffer of recent microphone windows.
7. **Dynamic UI based on dB:**
   - `< 70 dB`: show `./media/welcom_logo.svg`, background `./media/background_image_0.png`.
   - `70–85 dB`: show `./media/noise_level_msg_1.svg`, background `./media/background_image_1.png`.
   - `85–100 dB`: show `./media/noise_level_msg_2.svg`, background `./media/background_image_2.png`.
   - `100–120 dB`: show `./media/noise_level_msg_3.svg`, background `./media/background_image_3.png`.
   - `> 120 dB`: show `./media/noise_level_msg_4.svg`, background `./media/background_image_4.png`.
8. **Fallbacks**:
   - If microphone is unavailable or permission denied: keep visualizer at zero, show `--` in dB reading, surface errors in `controls_dialog` messages.

---

## 3) Project Structure

```text
./
├─ plan/
│  ├─ dBwatch_main.png               # Provided mock
│  ├─ dBwatch_control.png            # Provided mock
│  ├─ dbTester.html                  # Provided demo with sample logic
│  └─ plan.md                        # This plan
├─ media/
│  ├─ welcom_logo.svg
│  ├─ noise_level_msg_1.svg
│  ├─ noise_level_msg_2.svg
│  ├─ noise_level_msg_3.svg
│  ├─ noise_level_msg_4.svg
│  ├─ background_image_0.png
│  ├─ background_image_1.png
│  ├─ background_image_2.png
│  ├─ background_image_3.png
│  └─ background_image_4.png
├─ src/
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  ├─ sw.js                         # Service worker
│  └─ manifest.json                 # Web App Manifest
└─ assets/icons/                    # PWA icons (192x192, 512x512, maskable)
