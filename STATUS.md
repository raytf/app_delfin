# Delfin — Gemma 4-Powered Implementation Status

> Last updated: 2024-04-23 (Phase 7 M1 implementation completed)
> Legend: ✅ Implemented · ⚠️ Partial / placeholder · ❌ Not started

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
| `src/renderer/App.tsx` | ✅ | Main orchestration: overlay routing, session flow, VAD wiring, audio playback, history loading, and deletion |
| `src/renderer/components/HomeScreen.tsx` | ✅ | Landing screen, session naming modal, recent sessions, and quick deletion |
| `src/renderer/components/AllSessionsPage.tsx` | ✅ | Full session-history browser |
| `src/renderer/components/PastSessionView.tsx` | ✅ | Past-session replay with metadata sidebar and delete action |
| `src/renderer/components/SessionEndedView.tsx` | ✅ | End-of-session summary screen |
| `src/renderer/components/ExpandedSessionView.tsx` | ✅ | Main active-session conversation view with voice state and controls |
| `src/renderer/components/MinimizedSessionBar.tsx` + `MinimizedPromptPanel.tsx` | ✅ | Compact/minimized overlay experience for ask/respond loops |
| `src/renderer/components/SessionConversation.tsx` + `SessionPromptComposer.tsx` | ✅ | Reusable conversation rendering and prompt entry |
| `src/renderer/components/SessionHistoryCard.tsx`, `UserNameModal.tsx`, `ThinkingDots.tsx`, `VoiceWaveform.tsx` | ✅ | Supporting UI for identity, session history, loading, and waveform display |
| `src/renderer/components/ChatPanel.tsx`, `ChatInput.tsx`, `CapturePreview.tsx`, `QuickActions.tsx`, `PresetPicker.tsx`, `StatusIndicator.tsx`, `StopButton.tsx`, `MinimizeToggle.tsx` | ⚠️ | Legacy phase-plan placeholders; current UI is implemented through newer components |
| `src/renderer/stores/sessionStore.ts` | ✅ | Active conversation state, minimized-response state, and persisted session history cache |
| `src/renderer/stores/settingsStore.ts` | ✅ | Persists the user name locally |
| `src/renderer/stores/captureStore.ts` | ⚠️ | Placeholder |
| `src/renderer/types/assets.d.ts` | ✅ | Renderer asset declarations for strict TypeScript |

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

## Phase 7 — Memory System (LLM Wiki)

| Feature | Status | Notes |
|---|---|---|
| M0 viability spike | ✅ | Implemented with engine support and comprehensive testing |
| Memory schemas | ✅ | Pydantic models in `sidecar/memory/schemas.py` |
| XDG directory structure | ✅ | Proper XDG_DATA_HOME usage in `sidecar/memory/xdg_utils.py` |
| M1: Read-only wiki infrastructure | ✅ | FastAPI router with REST endpoints implemented |
| M1: Memory store | ✅ | File I/O operations in `sidecar/memory/store.py` |
| M1: Memory index | ✅ | Wiki indexing and search in `sidecar/memory/index.py` |
| M1: REST endpoints | ✅ | `/memory/health`, `/memory/index`, `/memory/page`, `/memory/search`, `/memory/stats`, `/memory/log`, `/memory/log/clear` |
| M1: Memory UI | ✅ | `MemoryView.tsx` and `WikiPageReader.tsx` components |
| M1: Logbook | ✅ | `logbook.py` with operation logging and log endpoints |
| M1: AGENTS.md Template | ✅ | Seeded with user-editable conventions |
| M1: Wikilink Support | ✅ | `[[Page Name]]` navigation in WikiPageReader |
| M1: Frontmatter Parsing | ✅ | Robust YAML-like frontmatter handling with list support |
| M1: Integration | ✅ | Wired into main application with HomeScreen button |
| M2: Session ingestion pipeline | ✅ | IngestPipeline class with entity extraction, source page creation, and index updating |
| M2: Ingest REST endpoints | ✅ | /memory/ingest/session and /memory/ingest/status endpoints |
| M2: Ingest status UI | ✅ | IngestStatusCard component with progress tracking |
| Wiki search tools | ❌ | Not started |
