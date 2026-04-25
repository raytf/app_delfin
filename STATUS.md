# Delfin — Gemma 4-Powered Implementation Status

> Last updated: 2026-04-22 (overlay defaults expanded; overlay load screens removed; shared goBack helper added)
> Legend: ✅ Implemented · ⚠️ Placeholder (file exists, no real logic) · ❌ Not started

---

## Phase 0 — Project Scaffold

| File / Item | Status | Notes |
|---|---|---|
| Electron + Vite + React + TypeScript scaffold | ✅ | `electron.vite.config.ts`, `package.json` |
| `.env.example` + dotenv loading | ✅ | Shared env contract for Electron and sidecar, including voice/TTS settings |
| `src/shared/types.ts` | ✅ | IPC, WebSocket, session history, overlay, and audio-bearing turn types |
| `src/shared/schemas.ts` | ✅ | Zod validation for WS and session prompt contracts |
| `src/shared/constants.ts` | ✅ | Presets, sidebar constants, `VOICE_TURN_TEXT` |
| `scripts/mock-sidecar.js` | ✅ | Mock sidecar for Electron/UI work |
| `scripts/run-sidecar.mjs` | ✅ | Helper script used by `npm run dev:sidecar` / `dev:full` |
| `scripts/init-env.mjs`, `scripts/setup-sidecar.mjs`, `scripts/check-env.mjs` | ✅ | One-command setup and env validation |
| `scripts/download-models.mjs` | ✅ | Atomic Kokoro model download flow with temp `.part` files |
| `scripts/download-models.test.mjs` | ✅ | Vitest coverage for safe model download behavior |
| `scripts/check-vad-runtime.mjs` | ✅ | Verifies copied VAD/ORT runtime assets |
| `scripts/setup-check.sh` / `scripts/setup-check.ps1` | ✅ | Environment validation helpers |

---

## Phase 1 — Inference Sidecar

| File / Item | Status | Notes |
|---|---|---|
| `sidecar/server.py` — FastAPI app + lifespan | ✅ | Loads the engine on startup and pre-warms it |
| `sidecar/server.py` — `GET /health` endpoint | ✅ | Returns `model_loaded`, backend, model file, and vision token budget |
| `sidecar/server.py` — `WS /ws` endpoint | ✅ | Single-consumer queue pattern with per-connection state |
| `sidecar/server.py` — interrupt handling | ✅ | `{"type":"interrupt"}` sets an `asyncio.Event` for the active turn |
| `sidecar/server.py` — multimodal request assembly | ✅ | Accepts image, text, and optional base64 WAV audio blobs |
| `sidecar/server.py` — token streaming | ✅ | Streams Gemma 4 text tokens directly back to Electron |
| `sidecar/server.py` — sentence-level TTS streaming | ✅ | Sends `audio_start` / `audio_chunk` / `audio_end` before `done` when TTS is available |
| `sidecar/inference/engine.py` — model load + GPU→CPU fallback | ✅ | Uses Hugging Face download and LiteRT-LM backend fallback |
| `sidecar/inference/engine.py` — audio backend behavior | ✅ | Audio backend remains pinned to CPU in both load paths |
| `sidecar/inference/engine.py` — `pre_warm()` | ✅ | Throwaway prompt on startup |
| `sidecar/inference/preprocess.py` — `resize_image_blob()` | ✅ | In-memory base64 → PIL → resized JPEG, no temp files |
| `sidecar/prompts/lecture_slide.py` | ✅ | Lecture-slide preset prompt |
| `sidecar/prompts/generic_screen.py` | ✅ | Generic-screen preset prompt |
| `sidecar/prompts/presets.py` | ✅ | `preset_id → system prompt` registry |
| `sidecar/tts.py` | ✅ | Kokoro ONNX, MLX-on-Apple-Silicon, and renderer-fallback TTS pipeline |
| `sidecar/tests/test_tts.py` | ✅ | Covers sentence splitting and fallback TTS behavior |
| Conversation history trimming | ❌ | Not implemented (still a nice-to-have) |

---

## Phase 2 — Electron Shell + Capture

| File / Item | Status | Notes |
|---|---|---|
| `src/main/overlay/overlayWindow.ts` | ✅ | Expanded window plus compact / prompt-input / prompt-response minimized variants |
| `src/main/capture/captureService.ts` — `captureForegroundWindow()` | ✅ | Captures the active window as base64 JPEG |
| `src/main/capture/focusDetector.ts` — `getActiveWindowSource()` | ✅ | Excludes the Delfin window from capture candidates |
| `src/main/sidecar/wsClient.ts` | ✅ | Persistent WebSocket client with reconnect and Zod-validated inbound messages |
| `src/main/ipc/sidecarBridge.ts` | ✅ | Bridges WebSocket messages into renderer IPC and persistence updates |
| `src/main/ipc/overlayHandlers.ts` | ✅ | Overlay mode, minimized variant, and ended-session IPC flows |
| `src/main/ipc/sessionHandlers.ts` | ✅ | Session start/stop, prompt submit, history lookup, image lookup, and deletion |
| `src/preload/index.ts` | ✅ | Full `contextBridge` API for capture, sidecar, overlay, and session actions |
| `src/main/index.ts` | ✅ | App startup, env validation, COOP/COEP, microphone permissions, and window lifecycle |
| `src/main/capture/autoRefresh.ts` | ⚠️ | Placeholder — auto-refresh diffing not implemented yet |
| `src/main/sidecar/healthCheck.ts` | ⚠️ | Placeholder — dedicated `/health` polling not implemented |

---

## Phase 3 — React Sidebar UI

| File / Item | Status | Notes |
|---|---|---|
| `src/renderer/App.tsx` | ✅ | Session/overlay mode routing, all IPC listeners, streaming state, and past-session deletion flow |
| `src/renderer/navigation/goBack.ts` | ✅ | Shared history-back helper with fallback route support |
| `src/renderer/hooks/useOverlayState.tsx` | ✅ | Overlay store reconciliation plus centralized optimistic `setOverlayMode()` helper with IPC rollback; overlay state defaults to expanded |
| `src/renderer/features/active-session/ActiveSessionScreen.tsx` | ✅ | Renders directly from overlay store mode; local active-session reducer removed |
| `src/renderer/features/active-session/hooks/useActiveSession.ts` | ✅ | Active-session state/actions hook; replaces `useActiveSessionController`, uses shared overlay hook, and ignores stale cancelled-turn audio/fallback output |
| `src/renderer/components/HomeScreen.tsx` | ✅ | Landing screen with Start Session button and recent-session deletion |
| `src/renderer/components/ExpandedSessionView.tsx` | ✅ | Prompt form, status display, auto-scrolling chat box with animated typing indicator |
| `src/renderer/components/MinimizedSessionBar.tsx` | ✅ | Compact overlay bar with prompt input, expand, and end-session buttons |
| `src/renderer/components/ChatPanel.tsx` | ⚠️ | Placeholder |
| `src/renderer/components/ChatInput.tsx` | ⚠️ | Placeholder |
| `src/renderer/components/CapturePreview.tsx` | ⚠️ | Placeholder |
| `src/renderer/components/QuickActions.tsx` | ⚠️ | Placeholder |
| `src/renderer/components/PresetPicker.tsx` | ⚠️ | Placeholder |
| `src/renderer/components/StatusIndicator.tsx` | ⚠️ | Placeholder |
| `src/renderer/components/StopButton.tsx` | ⚠️ | Placeholder |
| `src/renderer/components/MinimizeToggle.tsx` | ⚠️ | Placeholder |
| `src/renderer/stores/sessionStore.ts` | ✅ | Active conversation state plus persisted session history updates, including deletion |
| `src/renderer/stores/settingsStore.ts` | ⚠️ | Placeholder — returns empty object |
| `src/renderer/stores/captureStore.ts` | ⚠️ | Placeholder — returns empty object |
| `src/renderer/types/assets.d.ts` | ✅ | Renderer asset module declarations for strict TypeScript imports |

---

## Phase 4 — End-to-End Integration

| Feature | Status | Notes |
|---|---|---|
| Sidecar WS → IPC → renderer routing | ✅ | `token`, `audio_*`, `done`, and `error` messages are bridged end-to-end |
| Persistent session storage | ✅ | `sessionPersistenceService.ts` + `fileSessionStorage.ts` save sessions, messages, and captured images |
| `SESSION_SUBMIT_PROMPT` — capture + persist + send to sidecar | ✅ | Each turn captures the active window, stores the image, and forwards the prompt |
| `SESSION_GET_DETAIL` / `SESSION_GET_MESSAGE_IMAGE` | ✅ | Past sessions and stored capture thumbnails can be reopened |
| `SESSION_DELETE` — remove persisted session data | ✅ | Deletes session index entries, conversation JSON, and stored captures |
| Session start/stop ↔ overlay transitions | ✅ | `home ↔ active` and `expanded ↔ minimized` are fully wired |
| Streaming token display in renderer | ✅ | Assistant text is accumulated live in the conversation UI |
| Sidecar connection status display | ✅ | Renderer shows connect/disconnect state from the WebSocket client |
| `.env` validation on startup | ✅ | Warn-only validation for sidecar URL, voice/TTS booleans, and audio backend values |
| Health check polling (`healthCheck.ts`) | ⚠️ | Placeholder — backend/model metadata is not actively polled |
| Latency tracking (time-to-first-token) | ❌ | Not implemented |
| Manual stop/interrupt UI | ❌ | Interrupt channel exists, but there is no dedicated user-facing stop control yet |

---

## Phase 5 — Voice Pipeline + TTS

> **Current direction:** Voice is the default interaction mode when `VOICE_ENABLED=true`. VAD runs in the renderer, voice turns send base64 WAV audio alongside the captured screen, Gemma 4 handles the multimodal turn in the sidecar, and TTS audio streams back sentence by sentence when server-side speech is available.

### Runtime + asset pipeline

| Item | Status | Notes |
|---|---|---|
| `@ricky0123/vad-web` runtime | ✅ | Integrated with self-hosted browser runtime assets |
| `vite-plugin-static-copy` + `check:vad-runtime` | ✅ | Required VAD/ORT files are copied and validated |
| COOP/COEP headers + mic permissions | ✅ | Configured in `src/main/index.ts` |

### Renderer voice input

| Item | Status | Notes |
|---|---|---|
| `src/renderer/hooks/useVAD.ts` | ✅ | Mic VAD lifecycle, speech detection, audio level tracking, and threshold control |
| `src/renderer/utils/audioUtils.ts` | ✅ | WAV encoding for outbound voice turns and PCM decode for playback |
| `src/shared/types.ts` / `schemas.ts` — audio-bearing request types | ✅ | Voice turns carry optional base64 WAV audio |
| `VOICE_TURN_TEXT` contract | ✅ | Shared constant for pure voice turns |
| `src/main/ipc/sessionHandlers.ts` — audio-aware submit path | ✅ | Allows voice turns even when free-typed text is absent |
| `src/renderer/App.tsx` — auto-start VAD + voice submission | ✅ | Starts listening in active sessions and submits captured WAV on speech end |

### TTS + playback

| Item | Status | Notes |
|---|---|---|
| `sidecar/tts.py` — Kokoro/MLX/fallback pipeline | ✅ | Cross-platform server-side speech with renderer fallback |
| `.env.example` — TTS and voice settings | ✅ | Documents `VOICE_ENABLED`, `TTS_ENABLED`, `TTS_BACKEND`, Kokoro settings, and `LITERT_AUDIO_BACKEND` |
| `sidecar/server.py` — sentence queue → `audio_start` / `audio_chunk` / `audio_end` | ✅ | Streams sentence-level PCM before `done` |
| Sidecar audio metadata | ✅ | Emits `sample_rate`, `index`, and `tts_time` metadata |
| `src/renderer/App.tsx` — streamed playback | ✅ | Decodes PCM chunks, schedules playback, and tracks assistant speaking state |
| Barge-in behavior | ✅ | Active speech playback can be interrupted by a new user voice turn |
| Web Speech fallback | ✅ | Renderer fallback when no server audio arrives |

### Voice UI + tests

| Item | Status | Notes |
|---|---|---|
| `ExpandedSessionView` voice card | ✅ | Shows listening / thinking / speaking / paused states |
| `MinimizedSessionBar` voice UI | ✅ | Keeps voice affordances available in compact and response modes |
| `VoiceWaveform` + waveform utilities | ✅ | Reusable waveform visualization and state derivation |
| Renderer waveform/minimized overlay tests | ✅ | `minimizedOverlay.test.ts`, `minimizedSessionBar.test.ts`, `waveformState.test.ts` |

### Auto-refresh (deprioritised)

| Item | Status | Notes |
|---|---|---|
| `AutoRefreshManager` with rolling-hash diffing | ⚠️ | Placeholder in `autoRefresh.ts` |
| Auto-refresh IPC wiring | ❌ | Deferred |
| Auto-refresh UI toggle | ❌ | Deferred |

---

## Phase 6 — Polish + Stretch Goals

| Feature | Status | Notes |
|---|---|---|
| Global keyboard shortcut `Ctrl+Shift+C` | ❌ | Not implemented |
| Error state polish | ⚠️ | Inline renderer errors exist, but broader disconnected/loading/capture polish is still incomplete |
| Visual styling pass | ⚠️ | Major ocean-themed UI styling is in place; final demo polish can still improve |
| Markdown rendering in chat box | ❌ | Conversation text is rendered as plain text |
| Dark mode toggle | ❌ | Not implemented |
| Manual window picker dropdown | ❌ | Not implemented |
| Ollama fallback engine | ❌ | Not implemented |
| Dockerfile for sidecar | ❌ | Not implemented |
| `demo-content/` — slide screenshots | ❌ | Directory exists with only a README |
| README — complete setup instructions | ✅ | Refreshed on 2026-04-13 |

---

## Documentation — Explanation Docs

| File | Status | Notes |
|---|---|---|
| `docs/explanations/sidecar-flow.md` | ✅ | Refreshed 2026-04-22: removed Phase 1 stubs + respond_to_user tool section; added preprocess layer, message-ordering section, TTS flow |
| `docs/explanations/session-overlay-state-machine.md` | ✅ | Refreshed 2026-04-22: fixed window dimensions (380×64 / 460×115 / 460×360); corrected resize-in-place vs destroy+recreate; window is always frameless |
| `docs/explanations/electron-ipc-and-ws-message-flow.md` | ✅ | Refreshed 2026-04-22: updated beginPromptSubmission/submitSessionPrompt signatures; added recordUserPrompt persistence step; corrected audio_start shape |
| `docs/explanations/react-zustand-state-flow.md` | ✅ | Refreshed 2026-04-22: settingsStore is not a stub; added minimizedResponseMessageId + sessionStartTime fields; expanded IPC cleanup channel list |
| `docs/explanations/voice-audio-pipeline.md` | ✅ | Refreshed 2026-04-22: screenshot taken in main process not renderer; updated submitSessionPrompt shape; corrected barge-in (mute + threshold + grace); audio_start has no sentence_count |
| `docs/explanations/screen-capture-and-window-filtering.md` | ✅ | No changes needed — consistent with current captureService implementation |
