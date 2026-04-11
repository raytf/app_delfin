# Screen Copilot — Implementation Status

> Last updated: 2026-04-11 (local VAD runtime contract fix confirmed working)
> Legend: ✅ Implemented · ⚠️ Placeholder (file exists, no real logic) · ❌ Not started

---

## Phase 0 — Project Scaffold

| File / Item | Status | Notes |
|---|---|---|
| Electron + Vite + React + TypeScript scaffold | ✅ | `electron.vite.config.ts`, `package.json` |
| `.env.example` + dotenv loading | ✅ | Read in both main process and sidecar |
| `src/shared/types.ts` | ✅ | All IPC, WebSocket, overlay, and session types; `StructuredResponse` removed |
| `src/shared/schemas.ts` | ✅ | Zod schemas for inbound/outbound WS messages; `structuredResponseSchema` removed |
| `src/shared/constants.ts` | ✅ | Preset definitions, `DEFAULT_PRESET`, `SIDEBAR_WIDTH` |
| `scripts/mock-sidecar.js` | ✅ | Mock sidecar — tokens only (no structured message) |
| `scripts/setup-check.sh` | ✅ | Environment validation script |

---

## Phase 1 — Inference Sidecar

| File / Item | Status | Notes |
|---|---|---|
| `sidecar/server.py` — FastAPI app + lifespan | ✅ | Model loaded on startup, pre-warm runs |
| `sidecar/server.py` — `GET /health` endpoint | ✅ | Returns `model_loaded`, `backend`, `model`, `vision_tokens` |
| `sidecar/server.py` — `WS /ws` endpoint | ✅ | Single-consumer queue pattern, per-connection closure |
| `sidecar/server.py` — interrupt handling | ✅ | `{"type":"interrupt"}` sets `asyncio.Event`, clears on next turn |
| `sidecar/server.py` — preset switching per connection | ✅ | `preset_id` in message updates the active system prompt |
| `sidecar/server.py` — pure token streaming | ✅ | `handle_turn` streams tokens directly; no tool calls or structured response |
| `sidecar/inference/engine.py` — model load + GPU→CPU fallback | ✅ | `hf_hub_download`, `cache_dir` set |
| `sidecar/inference/engine.py` — `pre_warm()` | ✅ | Throwaway prompt on startup |
| `sidecar/inference/preprocess.py` — `resize_image_blob()` | ✅ | In-memory base64→PIL→resize→JPEG, no temp files |
| `sidecar/prompts/lecture_slide.py` | ✅ | Answer-first plain prose; Key Points + conditional Hints sections; no tool-call instructions |
| `sidecar/prompts/generic_screen.py` | ✅ | Description + Key Elements plain prose; no tool-call instructions |
| `sidecar/prompts/presets.py` | ✅ | Registry: `preset_id → system prompt` |
| `sidecar/tts.py` — TTS pipeline | ⚠️ | Placeholder — `generate()` returns empty array |
| Conversation history trimming | ❌ | Not implemented (nice-to-have, Phase 6) |

---

## Phase 2 — Electron Shell + Capture

| File / Item | Status | Notes |
|---|---|---|
| `src/main/overlay/overlayWindow.ts` | ✅ | Expanded + minimized modes (compact/prompt variants), always-on-top, transparent |
| `src/main/capture/captureService.ts` — `captureForegroundWindow()` | ✅ | Returns `CaptureFrame` with base64 JPEG at quality 80 |
| `src/main/capture/focusDetector.ts` — `getActiveWindowSource()` | ✅ | Filters out "Screen Copilot" window |
| `src/main/sidecar/wsClient.ts` | ✅ | Persistent WS, 2s auto-reconnect, Zod-validated inbound messages |
| `src/main/ipc/handlers.ts` | ✅ | All IPC channels wired: capture, sidecar send/interrupt, overlay, session |
| `src/main/index.ts` | ✅ | App entry, window lifecycle, overlay/session mode state machine |
| `src/preload/index.ts` | ✅ | Full `contextBridge` API: all capture, sidecar, overlay, and session methods |
| `src/main/capture/autoRefresh.ts` | ⚠️ | Placeholder — `start/stop` are no-ops |
| `src/main/sidecar/healthCheck.ts` | ⚠️ | Placeholder — polling not implemented |

---

## Phase 3 — React Sidebar UI

| File / Item | Status | Notes |
|---|---|---|
| `src/renderer/App.tsx` | ✅ | Session/overlay mode routing, all IPC listeners, streaming state; structured response removed |
| `src/renderer/components/HomeScreen.tsx` | ✅ | Landing screen with Start Session button |
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
| `src/renderer/stores/sessionStore.ts` | ⚠️ | Placeholder — returns empty object |
| `src/renderer/stores/settingsStore.ts` | ⚠️ | Placeholder — returns empty object |
| `src/renderer/stores/captureStore.ts` | ⚠️ | Placeholder — returns empty object |

---

## Phase 4 — End-to-End Integration

| Feature | Status | Notes |
|---|---|---|
| Sidecar WS → IPC → renderer message routing | ✅ | `token`, `audio_*`, `done`, `error` all forwarded; `structured` removed |
| `SESSION_SUBMIT_PROMPT` — capture + send to sidecar | ✅ | Captures foreground window, sends image + text over WS |
| Session start/stop ↔ overlay mode transitions | ✅ | `home ↔ active`, `expanded ↔ minimized` fully wired |
| Streaming token display in renderer | ✅ | `App.tsx` accumulates tokens into `streamedText`; chat box auto-scrolls with typing indicator |
| Structured response display in renderer | ❌ | Removed — model now streams plain prose directly |
| Sidecar connection status display | ✅ | Connected/disconnected shown inline in `ExpandedSessionView` |
| Health check polling (`healthCheck.ts`) | ⚠️ | Placeholder — model/backend info not fetched |
| Latency tracking (time-to-first-token) | ❌ | Not implemented (Phase 4.5) |
| Stop/interrupt mid-stream | ❌ | IPC channel exists in preload; `StopButton` is a placeholder |
| `.env` validation on startup | ✅ | `src/main/envValidation.ts` — warns on missing file, bad `SIDECAR_WS_URL`, invalid boolean/enum vars; never throws |

---

## Phase 5 — Voice Pipeline + TTS

> **Approach revised (2026-04-11):** Voice is now the *default* input mode. When a session starts, always-on VAD (Silero via `@ricky0123/vad-web`) listens for speech. The browser runtime is self-hosted from `vad-runtime/` via local script tags (`ort.wasm.min.js` + `bundle.min.js`) instead of importing VAD/ORT through the Vite module graph, and `useVAD` resolves `baseAssetPath` / `onnxWASMBasePath` to an absolute `vad-runtime/` URL to avoid duplicated relative paths in dev. This local-runtime contract is now confirmed working. On speech end, a WAV blob + screen capture are sent to the sidecar. Gemma 4 processes audio natively. TTS streams response audio back as chunks. Manual text entry remains alongside. Auto-refresh remains a lower-priority stretch goal.

### Step 1 — Dependencies + WASM asset serving

| Item | Status | Notes |
|---|---|---|
| `@ricky0123/vad-web` npm package | ✅ | Installed; renderer loads the self-hosted browser bundle from `vad-runtime/` |
| `vite-plugin-static-copy` dev dep | ✅ | Installed; copies browser bundles, ONNX models, and all required `ort-wasm*` files |
| Vite renderer config — copy VAD WASM/worker files | ✅ | `electron.vite.config.ts` serves a stable local `vad-runtime/` asset directory |
| Electron main — COOP/COEP headers (`session.webRequest`) | ✅ | `src/main/index.ts` sets `same-origin` + `credentialless` to preserve `SharedArrayBuffer` |
| Electron main — `media` permission handler (`getUserMedia`) | ✅ | `src/main/index.ts` grants `media` / `microphone` permission requests |

### Step 2 — Audio utilities

| Item | Status | Notes |
|---|---|---|
| `src/renderer/utils/audioUtils.ts` — `float32ToWavBase64()` | ✅ | RIFF header, 16 kHz, 16-bit mono |
| `src/renderer/utils/audioUtils.ts` — `decodeAudioChunk()` | ✅ | base64 int16 PCM → `AudioBuffer` |

### Step 3 — VAD hook

| Item | Status | Notes |
|---|---|---|
| `src/renderer/hooks/useVAD.ts` | ✅ | Uses global `window.vad.MicVAD`; exposes `isListening`, `isMuted`, `toggleMute`, `raiseThreshold`, `lowerThreshold` |
| `src/renderer/types/vad-runtime.d.ts` | ✅ | Minimal ambient types for `window.vad` and `window.ort` in strict TS |
| Barge-in threshold management (0.50 normal / 0.92 while AI speaks) | ✅ | Inside `useVAD` |
| Barge-in grace period (`BARGE_IN_GRACE_MS = 800`) | ✅ | Inside `useVAD` |
| WAV conversion on `onSpeechEnd` (`float32ToWavBase64`) | ✅ | Inside `useVAD` |

### Step 4 — Types, IPC wiring, session auto-start

| Item | Status | Notes |
|---|---|---|
| `src/shared/types.ts` — `audio?: string` on `SessionPromptRequest` + `WsOutboundMessage` | ✅ | Voice turns carry base64 WAV audio |
| `src/shared/schemas.ts` — `audio` field in `wsOutboundMessageSchema` | ✅ | Zod schemas accept audio-bearing outbound/inbound WS messages |
| `src/shared/constants.ts` — `VOICE_TURN_TEXT` constant | ✅ | `"Please respond to what the user just asked."` |
| `src/main/ipc/sessionHandlers.ts` — pass `audio` to sidecar; relax empty-text guard | ✅ | Allows audio turns and forwards `audio` to the WS client |
| `src/renderer/App.tsx` — `useVAD` wired; auto-starts when `sessionMode === 'active'` | ✅ | Auto-starts when `VOICE_ENABLED=true` and a session is active |
| `src/renderer/App.tsx` — `onSpeechEnd` → `submitSessionPrompt` with WAV | ✅ | Uses `VOICE_TURN_TEXT` plus captured WAV audio |
| `VOICE_ENABLED` env var (`.env` / `.env.example`) | ✅ | `true` enables auto-start VAD on session start |

### Step 5 — Sidecar: audio blob + configurable audio backend

| Item | Status | Notes |
|---|---|---|
| `sidecar/server.py` `handle_turn` — prepend `{type:"audio", blob:...}` when present | ✅ | Voice turns append `{type: "audio", "blob": ...}` before text |
| `sidecar/inference/engine.py` — `LITERT_AUDIO_BACKEND` env var (replaces hardcoded CPU) | ❌ | Engine still hardcodes CPU audio backend |
| `.env.example` — `LITERT_AUDIO_BACKEND=CPU` | ✅ | Env example documents the current CPU-only audio backend setting |

### Step 6 — TTS pipeline + wire into `handle_turn`

| Item | Status | Notes |
|---|---|---|
| `sidecar/tts.py` — real `TTSPipeline` (kokoro-onnx backend + `none` fallback) | ✅ | Kokoro backend implemented; falls back to renderer TTS when unavailable |
| `sidecar/tts.py` — `KOKORO_MODEL_PATH` / `KOKORO_VOICES_PATH` env vars | ✅ | Reads configurable model + voices paths from env |
| `sidecar/server.py` — accumulate `full_text` during token stream | ✅ | Used to synthesize TTS after the token stream completes |
| `sidecar/server.py` — sentence split → `audio_start` / `audio_chunk` / `audio_end` after `done` | ✅ | Streams sentence-sized audio chunks when server-side TTS is available |
| `.env.example` — `KOKORO_MODEL_PATH`, `KOKORO_VOICES_PATH` | ✅ | Documented in `.env.example` |

### Step 7 — Web Audio API playback in renderer

| Item | Status | Notes |
|---|---|---|
| `src/renderer/App.tsx` — `onSidecarAudioStart` listener (init `AudioContext`, set `isAudioPlaying`) | ✅ | Starts audio playback state and raises VAD threshold |
| `src/renderer/App.tsx` — `onSidecarAudioChunk` listener (`streamNextTime` gap-free scheduling) | ✅ | Decodes/schedules PCM chunks with Web Audio API |
| `src/renderer/App.tsx` — `onSidecarAudioEnd` listener (clear `isAudioPlaying`) | ✅ | Resets playback state and lowers VAD threshold |
| Audio IPC listeners cleaned up in `useEffect` return | ✅ | Removes all sidecar/capture listeners on cleanup |

### Step 8 — Barge-in + Web Speech fallback

| Item | Status | Notes |
|---|---|---|
| `src/renderer/App.tsx` — `handleVADSpeechStart` stops `AudioContext` + calls `sidecarInterrupt` | ✅ | Barge-in interrupts both playback and the current sidecar turn |
| Web Speech API fallback — `speechSynthesis.speak()` after `onSidecarDone` when no audio arrived | ✅ | Timed fallback via `speechSynthesis` when server audio is absent |

### Step 9 — UI indicators

| Item | Status | Notes |
|---|---|---|
| `ExpandedSessionView` — 🔊 pulsing indicator while `isAudioPlaying` | ✅ | Inline speaking indicator shown during audio playback |
| `ExpandedSessionView` — 🎙️ / 🔇 mic toggle button | ✅ | Mic status + mute toggle rendered above the conversation |
| `MinimizedSessionBar` — same mic + speaker indicators | ✅ | Compact overlay shows mic/speaking state and mute control |

### Auto-refresh (deprioritised)

| Item | Status | Notes |
|---|---|---|
| `AutoRefreshManager` with rolling-hash diffing | ⚠️ | Placeholder in `autoRefresh.ts`; deferred past voice pipeline |
| Auto-refresh IPC wiring | ❌ | Deferred |
| Auto-refresh UI toggle | ❌ | Deferred |

---

## Phase 6 — Polish + Stretch Goals

| Feature | Status | Notes |
|---|---|---|
| Global keyboard shortcut `Ctrl+Shift+C` | ❌ | Not implemented |
| Error state polish (disconnected, loading, capture fail) | ❌ | Not implemented |
| Visual styling pass (colour palette, spacing, typography) | ❌ | Current UI is functional but unstyled |
| Markdown rendering in chat box | ❌ | Chat box displays raw text; add `react-markdown` to render bold, bullet lists, etc. |
| Dark mode toggle | ❌ | Not implemented |
| Manual window picker dropdown | ❌ | Not implemented |
| Ollama fallback engine | ❌ | Not implemented |
| Dockerfile for sidecar | ❌ | Not implemented |
| `demo-content/` — slide screenshots | ❌ | Directory exists with only a README |
| README — complete setup instructions | ❌ | Root README exists but is sparse |
