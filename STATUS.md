# Screen Copilot — Implementation Status

> Last updated: 2026-04-11
> Legend: ✅ Implemented · ⚠️ Placeholder (file exists, no real logic) · ❌ Not started

---

## Phase 0 — Project Scaffold

| File / Item | Status | Notes |
|---|---|---|
| Electron + Vite + React + TypeScript scaffold | ✅ | `electron.vite.config.ts`, `package.json` |
| `.env.example` + dotenv loading | ✅ | Read in both main process and sidecar |
| `src/shared/types.ts` | ✅ | All IPC, WebSocket, overlay, and session types |
| `src/shared/schemas.ts` | ✅ | Zod schemas for all inbound/outbound WS messages |
| `src/shared/constants.ts` | ✅ | Preset definitions, `DEFAULT_PRESET`, `SIDEBAR_WIDTH` |
| `scripts/mock-sidecar.js` | ✅ | Mock sidecar for frontend development |
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
| `sidecar/server.py` — Gemma 4 quote token cleanup | ✅ | `_clean_tool_result()` strips `<\|"\|>` artifacts |
| `sidecar/server.py` — `_extract_structured_from_text()` | ✅ | Regex fallback when tool calling fails |
| `sidecar/inference/engine.py` — model load + GPU→CPU fallback | ✅ | `hf_hub_download`, `cache_dir` set |
| `sidecar/inference/engine.py` — `pre_warm()` | ✅ | Throwaway prompt on startup |
| `sidecar/inference/preprocess.py` — `resize_image_blob()` | ✅ | In-memory base64→PIL→resize→JPEG, no temp files |
| `sidecar/prompts/lecture_slide.py` | ✅ | Lecture slide system prompt |
| `sidecar/prompts/generic_screen.py` | ✅ | Generic screen system prompt |
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
| `src/renderer/App.tsx` | ✅ | Session/overlay mode routing, all IPC listeners, streaming state |
| `src/renderer/components/HomeScreen.tsx` | ✅ | Landing screen with Start Session button |
| `src/renderer/components/ExpandedSessionView.tsx` | ✅ | Prompt form, status display, structured response card, streaming text panel |
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
| Sidecar WS → IPC → renderer message routing | ✅ | `token`, `structured`, `audio_*`, `done`, `error` all forwarded |
| `SESSION_SUBMIT_PROMPT` — capture + send to sidecar | ✅ | Captures foreground window, sends image + text over WS |
| Session start/stop ↔ overlay mode transitions | ✅ | `home ↔ active`, `expanded ↔ minimized` fully wired |
| Streaming token display in renderer | ✅ | `App.tsx` accumulates tokens into `streamedText` state |
| Structured response display in renderer | ✅ | `ExpandedSessionView` renders summary / answer / key points |
| Sidecar connection status display | ✅ | Connected/disconnected shown inline in `ExpandedSessionView` |
| Health check polling (`healthCheck.ts`) | ⚠️ | Placeholder — model/backend info not fetched |
| Latency tracking (time-to-first-token) | ❌ | Not implemented (Phase 4.5) |
| Stop/interrupt mid-stream | ❌ | IPC channel exists in preload; `StopButton` is a placeholder |
| `.env` validation on startup | ❌ | Not implemented (Phase 4.6) |

---

## Phase 5 — Auto-Refresh + TTS

| Feature | Status | Notes |
|---|---|---|
| `AutoRefreshManager` with rolling-hash diffing | ⚠️ | Placeholder in `autoRefresh.ts` |
| Auto-refresh IPC wiring (`capture:auto-refresh`) | ❌ | IPC channel defined, handler not wired to manager |
| Auto-refresh UI toggle | ❌ | Not implemented |
| `TTSPipeline` (kokoro-onnx / mlx-audio) | ⚠️ | Placeholder in `tts.py` |
| TTS wired into `handle_turn` in `server.py` | ❌ | Not implemented |
| Web Audio API playback in renderer | ❌ | Not implemented |
| Web Speech API fallback | ❌ | Not implemented |
| TTS speaker indicator in UI | ❌ | Not implemented |

---

## Phase 6 — Polish + Stretch Goals

| Feature | Status | Notes |
|---|---|---|
| Global keyboard shortcut `Ctrl+Shift+C` | ❌ | Not implemented |
| Error state polish (disconnected, loading, capture fail) | ❌ | Not implemented |
| Visual styling pass (colour palette, spacing, typography) | ❌ | Current UI is functional but unstyled |
| Structured response card styling (`StructuredCard`) | ❌ | Inline in `ExpandedSessionView`, not a dedicated component |
| Dark mode toggle | ❌ | Not implemented |
| Manual window picker dropdown | ❌ | Not implemented |
| Ollama fallback engine | ❌ | Not implemented |
| Dockerfile for sidecar | ❌ | Not implemented |
| `demo-content/` — slide screenshots | ❌ | Directory exists with only a README |
| README — complete setup instructions | ❌ | Root README exists but is sparse |
