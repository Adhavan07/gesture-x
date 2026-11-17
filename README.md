# GESTUREX

Gesture-controlled and voice-assisted file upload workspace powered by local browser computer vision (MediaPipe Hand Landmarker), Web Speech API voice commands, traditional mouse/keyboard controls, and a secure Node.js/Express upload backend.

## Features

- **Real-time Local Hand Tracking**: Uses `navigator.mediaDevices.getUserMedia()` and MediaPipe `HandLandmarker` running locally in WebAssembly (`@mediapipe/tasks-vision`) with 21 hand landmarks rendered on a repositionable camera overlay.
- **Deterministic Gesture State Machine (`GestureEngine`)**: Supports `POINTING`, `PINCH` (select & drag-and-drop), `OPEN_PALM` (pause), `FIST` (cancel active drag), `THUMBS_UP` (confirm prompt), and `TWO_FINGER` (scroll) across `IDLE`, `POINTING`, `PINCH_STARTED`, `DRAGGING`, `DROPPING`, `PAUSED`, and `CANCELLED` states with hysteresis and cooldown protection.
- **Voice Assistant (`VoiceEngine` + `commandParser`)**: Supports Web Speech API recognition, `SpeechSynthesis` spoken responses, combined voice + gesture commands (`"Select this"` while pointing, `"Upload these files"`, `"Pause gesture control"`), ambiguity clarification, and a text command fallback input.
- **Shared `ActionDispatcher`**: All gesture, voice, mouse, and keyboard triggers route through a single unified action pipeline (`AppContext`).
- **Secure Modular Upload Backend**: Express + Multer bounded upload pipeline (`/api/upload`, `/api/uploads`) enforcing file extension allowlists, MIME checks, configurable size limits, and path-traversal sanitization backed by `LocalStorageProvider` (`server/storage.ts`).

## Installation & Execution

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

For production build and start:

```bash
npm run build
npm start
```

## Testing

Run unit tests (gesture math, `GestureEngine` FSM, voice command parser, file validation):

```bash
npm test
```

Run TypeScript type check:

```bash
npm run lint
```

## Browser Permissions & Compatibility Notes

- **Camera & Microphone Permissions**: Browser security requires HTTPS (or `localhost`) and explicit user permission. GESTUREX only requests webcam access when you click **Enable Gesture**, and microphone access when you click **Enable Voice**.
- **Web Speech API**: Speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`) is best supported in Chromium-based browsers (Chrome, Edge). Firefox and Safari may not expose continuous speech recognition; GESTUREX automatically detects this and keeps the text command input and quick-command chips active as a fallback.
- **Folder Selection**: Uses the File System Access API (`showDirectoryPicker`) where available and falls back to `<input type="file" webkitdirectory>` and recursive drag-and-drop directory scanning.
