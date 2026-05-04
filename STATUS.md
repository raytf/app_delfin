# Delfin — Implementation Status

> Last updated: 2026-05-04 (CI bridge workflow now uses `macos-15` for the `macos-arm64` matrix job because GitHub's `macos-14` / Xcode 15.4 toolchain fails the upstream `cxx` crate's C++20 `rust::Slice` contiguous-range check during Bazel builds.)
> Legend: ✅ Implemented · ⚠️ Placeholder (file exists, no real logic) · ❌ Not started
>
> Sections below mirror [`docs/README.md`](docs/README.md): one block of "Foundations" (the hackathon MVP, now in maintenance) followed by one block per active feature area under `docs/features/`. The original per-phase tables were collapsed when the project moved off numbered phases on 2026-05-03 — see [`docs/archive/hackathon-mvp.md`](docs/archive/hackathon-mvp.md).

---

# Foundations (Hackathon MVP)

The current shipping app. Originally tracked as Phases 0–6; preserved here as the working baseline that newer features build on top of.

## Project scaffold & build tooling

| File / Item                                                                  | Status | Notes                                                                                                                   |
| ---------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Electron + Vite + React + TypeScript scaffold                                | ✅     | `electron.vite.config.ts`, `package.json`                                                                               |
| `.env.example` + dotenv loading                                              | ✅     | Shared env contract for Electron, sidecar, voice/TTS settings, and LiteRT C++ bridge paths. `LLAMAFILE_*` block removed 2026-05-03. |
| `src/shared/types.ts`                                                        | ✅     | IPC, WebSocket, session history, overlay, and audio-bearing turn types                                                  |
| `src/shared/schemas.ts`                                                      | ✅     | Zod validation for WS and session prompt contracts                                                                      |
| `src/shared/constants.ts`                                                    | ✅     | Presets, sidebar constants, `VOICE_TURN_TEXT`                                                                           |
| `scripts/mock-sidecar.js`                                                    | ✅     | Mock sidecar for Electron/UI work                                                                                       |
| `scripts/run-sidecar.mjs`                                                    | ✅     | Helper script used by `npm run dev:sidecar` / `dev:full`                                                                |
| `scripts/init-env.mjs`, `scripts/setup-sidecar.mjs`, `scripts/check-env.mjs` | ✅     | One-command setup and env validation                                                                                    |
| `scripts/download-models.mjs`                                                | ✅     | Atomic Kokoro model download flow with temp `.part` files                                                               |
| `scripts/download-models.test.mjs`                                           | ✅     | Vitest coverage for safe model download behavior                                                                        |
| `scripts/check-vad-runtime.mjs`                                              | ✅     | Verifies copied VAD/ORT runtime assets                                                                                  |
| `scripts/setup-check.sh` / `scripts/setup-check.ps1`                         | ✅     | Environment validation helpers                                                                                          |
| `README.md`                                                                  | ✅     | User-facing setup guide. Native Windows LiteRT C++ section now documents VS Build Tools, Developer shell, short Bazel output root, and common `setup:litert-cpp` recovery steps. |

> Backend research scripts (benchmark harness, llamafile setup/runner, LiteRT C++ proxy and native bridge) used to live in this section. They have moved to [§Backend (`docs/features/backend/`)](#backend-docsfeaturesbackend) below.

---

## Sidecar (Python LiteRT-LM)

| File / Item                                                   | Status | Notes                                                                                 |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `sidecar/server.py` — FastAPI app + lifespan                  | ✅     | Loads the engine on startup and pre-warms it                                          |
| `sidecar/server.py` — `GET /health` endpoint                  | ✅     | Returns `model_loaded`, backend, model file, and vision token budget                  |
| `sidecar/server.py` — `WS /ws` endpoint                       | ✅     | Single-consumer queue pattern with per-connection state                               |
| `sidecar/server.py` — interrupt handling                      | ✅     | `{"type":"interrupt"}` sets an `asyncio.Event` for the active turn                    |
| `sidecar/server.py` — multimodal request assembly             | ✅     | Accepts image, text, and optional base64 WAV audio blobs                              |
| `sidecar/server.py` — token streaming                         | ✅     | Streams Gemma 4 text tokens directly back to Electron                                 |
| `sidecar/server.py` — sentence-level TTS streaming            | ✅     | Sends `audio_start` / `audio_chunk` / `audio_end` before `done` when TTS is available |
| `sidecar/inference/engine.py` — model load + GPU→CPU fallback | ✅     | Uses Hugging Face download and LiteRT-LM backend fallback                             |
| `sidecar/inference/engine.py` — audio backend behavior        | ✅     | Audio backend remains pinned to CPU in both load paths                                |
| `sidecar/inference/engine.py` — `pre_warm()`                  | ✅     | Throwaway prompt on startup                                                           |
| `sidecar/inference/preprocess.py` — `resize_image_blob()`     | ✅     | In-memory base64 → PIL → resized JPEG, no temp files                                  |
| `sidecar/prompts/lecture_slide.py`                            | ✅     | Lecture-slide preset prompt                                                           |
| `sidecar/prompts/generic_screen.py`                           | ✅     | Generic-screen preset prompt                                                          |
| `sidecar/prompts/presets.py`                                  | ✅     | `preset_id → system prompt` registry                                                  |
| `sidecar/tts.py`                                              | ✅     | Kokoro ONNX, MLX-on-Apple-Silicon, and renderer-fallback TTS pipeline                 |
| `sidecar/tests/test_tts.py`                                   | ✅     | Covers sentence splitting and fallback TTS behavior                                   |
| Conversation history trimming                                 | ❌     | Not implemented (still a nice-to-have)                                                |

---

## Electron main + capture

| File / Item                                                        | Status | Notes                                                                                |
| ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------ |
| `src/main/overlay/overlayWindow.ts`                                | ✅     | Expanded window plus compact / prompt-input / prompt-response minimized variants     |
| `src/main/capture/captureService.ts` — `captureForegroundWindow()` | ✅     | Captures the active window as base64 JPEG                                            |
| `src/main/capture/focusDetector.ts` — `getActiveWindowSource()`    | ✅     | Excludes the Delfin window from capture candidates                                   |
| `src/main/sidecar/wsClient.ts`                                     | ✅     | Persistent WebSocket client with reconnect and Zod-validated inbound messages        |
| `src/main/ipc/sidecarBridge.ts`                                    | ✅     | Bridges WebSocket messages into renderer IPC and persistence updates                 |
| `src/main/ipc/overlayHandlers.ts`                                  | ✅     | Overlay mode, minimized variant, and ended-session IPC flows                         |
| `src/main/ipc/sessionHandlers.ts`                                  | ✅     | Session start/stop, prompt submit, history lookup, image lookup, and deletion        |
| `src/preload/index.ts`                                             | ✅     | Full `contextBridge` API for capture, sidecar, overlay, and session actions          |
| `src/main/index.ts`                                                | ✅     | App startup, env validation, COOP/COEP, microphone permissions, and window lifecycle |
| `src/main/capture/autoRefresh.ts`                                  | ⚠️     | Placeholder — auto-refresh diffing not implemented yet                               |
| `src/main/sidecar/healthCheck.ts`                                  | ⚠️     | Placeholder — dedicated `/health` polling not implemented                            |

---

## React renderer

| File / Item                                                      | Status | Notes                                                                                                                                                      |
| ---------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/App.tsx`                                           | ✅     | Session/overlay mode routing, all IPC listeners, streaming state, and past-session deletion flow                                                           |
| `src/renderer/navigation/goBack.ts`                              | ✅     | Shared history-back helper with fallback route support                                                                                                     |
| `src/renderer/hooks/useOverlayState.tsx`                         | ✅     | Overlay store reconciliation plus centralized optimistic `setOverlayMode()` helper with IPC rollback; overlay state defaults to expanded                   |
| `src/renderer/features/active-session/ActiveSessionScreen.tsx`   | ✅     | Renders directly from overlay store mode; local active-session reducer removed                                                                             |
| `src/renderer/features/active-session/hooks/useActiveSession.ts` | ✅     | Active-session state/actions hook; replaces `useActiveSessionController`, uses shared overlay hook, and ignores stale cancelled-turn audio/fallback output |
| `src/renderer/components/HomeScreen.tsx`                         | ✅     | Landing screen with Start Session button and recent-session deletion                                                                                       |
| `src/renderer/components/ExpandedSessionView.tsx`                | ✅     | Prompt form, status display, auto-scrolling chat box with animated typing indicator                                                                        |
| `src/renderer/components/MinimizedSessionBar.tsx`                | ✅     | Compact overlay bar with prompt input, expand, and end-session buttons                                                                                     |
| `src/renderer/components/ChatPanel.tsx`                          | ⚠️     | Placeholder                                                                                                                                                |
| `src/renderer/components/ChatInput.tsx`                          | ⚠️     | Placeholder                                                                                                                                                |
| `src/renderer/components/CapturePreview.tsx`                     | ⚠️     | Placeholder                                                                                                                                                |
| `src/renderer/components/QuickActions.tsx`                       | ⚠️     | Placeholder                                                                                                                                                |
| `src/renderer/components/PresetPicker.tsx`                       | ⚠️     | Placeholder                                                                                                                                                |
| `src/renderer/components/StatusIndicator.tsx`                    | ⚠️     | Placeholder                                                                                                                                                |
| `src/renderer/components/StopButton.tsx`                         | ⚠️     | Placeholder                                                                                                                                                |
| `src/renderer/components/MinimizeToggle.tsx`                     | ⚠️     | Placeholder                                                                                                                                                |
| `src/renderer/stores/sessionStore.ts`                            | ✅     | Active conversation state plus persisted session history updates, including deletion                                                                       |
| `src/renderer/stores/settingsStore.ts`                           | ⚠️     | Placeholder — returns empty object                                                                                                                         |
| `src/renderer/stores/captureStore.ts`                            | ⚠️     | Placeholder — returns empty object                                                                                                                         |
| `src/renderer/types/assets.d.ts`                                 | ✅     | Renderer asset module declarations for strict TypeScript imports                                                                                           |

---

## End-to-end integration & persistence

| Feature                                                       | Status | Notes                                                                                                 |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Sidecar WS → IPC → renderer routing                           | ✅     | `token`, `audio_*`, `done`, and `error` messages are bridged end-to-end                               |
| Persistent session storage                                    | ✅     | `sessionPersistenceService.ts` + `fileSessionStorage.ts` save sessions, messages, and captured images |
| `SESSION_SUBMIT_PROMPT` — capture + persist + send to sidecar | ✅     | Each turn captures the active window, stores the image, and forwards the prompt                       |
| `SESSION_GET_DETAIL` / `SESSION_GET_MESSAGE_IMAGE`            | ✅     | Past sessions and stored capture thumbnails can be reopened                                           |
| `SESSION_DELETE` — remove persisted session data              | ✅     | Deletes session index entries, conversation JSON, and stored captures                                 |
| Session start/stop ↔ overlay transitions                      | ✅     | `home ↔ active` and `expanded ↔ minimized` are fully wired                                            |
| Streaming token display in renderer                           | ✅     | Assistant text is accumulated live in the conversation UI                                             |
| Sidecar connection status display                             | ✅     | Renderer shows connect/disconnect state from the WebSocket client                                     |
| `.env` validation on startup                                  | ✅     | Warn-only validation for sidecar URL, voice/TTS booleans, and audio backend values                    |
| Health check polling (`healthCheck.ts`)                       | ⚠️     | Placeholder — backend/model metadata is not actively polled                                           |
| Latency tracking (time-to-first-token)                        | ❌     | Not implemented                                                                                       |
| Manual stop/interrupt UI                                      | ❌     | Interrupt channel exists, but there is no dedicated user-facing stop control yet                      |

---

## Voice pipeline + TTS

> **Current direction:** Voice is the default interaction mode when `VOICE_ENABLED=true`. VAD runs in the renderer, voice turns send base64 WAV audio alongside the captured screen, Gemma 4 handles the multimodal turn in the sidecar, and TTS audio streams back sentence by sentence when server-side speech is available.

### Runtime + asset pipeline

| Item                                            | Status | Notes                                              |
| ----------------------------------------------- | ------ | -------------------------------------------------- |
| `@ricky0123/vad-web` runtime                    | ✅     | Integrated with self-hosted browser runtime assets |
| `vite-plugin-static-copy` + `check:vad-runtime` | ✅     | Required VAD/ORT files are copied and validated    |
| COOP/COEP headers + mic permissions             | ✅     | Configured in `src/main/index.ts`                  |

### Renderer voice input

| Item                                                               | Status | Notes                                                                            |
| ------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------- |
| `src/renderer/hooks/useVAD.ts`                                     | ✅     | Mic VAD lifecycle, speech detection, audio level tracking, threshold control, and mic-stream reattachment after pause/resume |
| `src/renderer/utils/audioUtils.ts`                                 | ✅     | WAV encoding for outbound voice turns and PCM decode for playback                |
| `src/shared/types.ts` / `schemas.ts` — audio-bearing request types | ✅     | Voice turns carry optional base64 WAV audio                                      |
| `VOICE_TURN_TEXT` contract                                         | ✅     | Shared constant for pure voice turns                                             |
| `src/main/ipc/sessionHandlers.ts` — audio-aware submit path        | ✅     | Allows voice turns even when free-typed text is absent                           |
| `src/renderer/App.tsx` — auto-start VAD + voice submission         | ✅     | Starts listening in active sessions and submits captured WAV on speech end       |
| `src/renderer/features/active-session/hooks/useActiveSession.ts`   | ✅     | Assistant playback state, fallback Web Speech handling, and VAD auto-mute/unmute lifecycle for repeated voice turns |

### TTS + playback

| Item                                                                               | Status | Notes                                                                                                |
| ---------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `sidecar/tts.py` — Kokoro/MLX/fallback pipeline                                    | ✅     | Cross-platform server-side speech with renderer fallback                                             |
| `.env.example` — TTS and voice settings                                            | ✅     | Documents `VOICE_ENABLED`, `TTS_ENABLED`, `TTS_BACKEND`, Kokoro settings, `LITERT_AUDIO_BACKEND`, LiteRT C++ proxy Piper env vars, and voice helper commands |
| `scripts/piper-voice.mjs`                                                          | ✅     | Local Piper voice manager: list installed voices, install official `rhasspy/piper-voices` assets, update `.env`, and read sample rates from configs |
| `scripts/piper-voice.test.mjs`                                                     | ✅     | Vitest coverage for path parsing, local voice listing, `.env` switching, mocked downloads, and proxy sample-rate fallback |
| `sidecar/server.py` — sentence queue → `audio_start` / `audio_chunk` / `audio_end` | ✅     | Streams sentence-level PCM before `done`                                                             |
| Sidecar audio metadata                                                             | ✅     | Emits `sample_rate`, `index`, and `tts_time` metadata                                                |
| `src/renderer/App.tsx` — streamed playback                                         | ✅     | Decodes PCM chunks, schedules playback, and tracks assistant speaking state                          |
| Barge-in behavior                                                                  | ✅     | Active speech playback can be interrupted by a new user voice turn                                   |
| Web Speech fallback                                                                | ✅     | Renderer fallback when no server audio arrives; still covers disabled/misconfigured Piper or other proxy paths without `audio_*` events |

### Voice UI + tests

| Item                                      | Status | Notes                                                                              |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `ExpandedSessionView` voice card          | ✅     | Shows listening / thinking / speaking / paused states                              |
| `MinimizedSessionBar` voice UI            | ✅     | Keeps voice affordances available in compact and response modes                    |
| `VoiceWaveform` + waveform utilities      | ✅     | Reusable waveform visualization and state derivation                               |
| Renderer waveform/minimized overlay tests | ✅     | `minimizedOverlay.test.ts`, `minimizedSessionBar.test.ts`, `waveformState.test.ts`, plus source-contract regression checks for `useVAD` / `useActiveSession` |

### Auto-refresh (deprioritised)

| Item                                           | Status | Notes                           |
| ---------------------------------------------- | ------ | ------------------------------- |
| `AutoRefreshManager` with rolling-hash diffing | ⚠️     | Placeholder in `autoRefresh.ts` |
| Auto-refresh IPC wiring                        | ❌     | Deferred                        |
| Auto-refresh UI toggle                         | ❌     | Deferred                        |

---

## Foundations — known polish gaps

The hackathon-era "Phase 6 — Polish + Stretch Goals" table is no longer tracked here. Stretch items that did not ship (global hotkey, Markdown rendering, dark mode, manual window picker, Dockerfile, etc.) were moved to [`docs/README.md` §Future ideas](docs/README.md#future-ideas-not-yet-scoped). The two items still worth tracking against the current shipping app are:

| Item                | Status | Notes                                                                                                |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Visual styling pass | ⚠️     | Major ocean-themed UI styling is in place; final polish can still improve before public distribution. |
| Error state polish  | ⚠️     | Inline renderer errors exist, but broader disconnected/loading/capture polish is still incomplete.    |

---

# Active features

## Backend (`docs/features/backend/`)

> Specs: [`native-windows-backend-research-spec.md`](docs/features/backend/native-windows-backend-research-spec.md), [`litert-cpp-bridge-runtime-validation-spec.md`](docs/features/backend/litert-cpp-bridge-runtime-validation-spec.md), [`litert-cpp-audio-input-spec.md`](docs/features/backend/litert-cpp-audio-input-spec.md), [`litert-cpp-primary-backend-migration-spec.md`](docs/features/backend/litert-cpp-primary-backend-migration-spec.md), [`inference-benchmarking-spec.md`](docs/features/backend/inference-benchmarking-spec.md). Completed sub-specs (vision, native audio input, Piper proxy TTS) are summarised in the parent research spec and archived under [`docs/archive/features/`](docs/archive/features/).

### Benchmark harness

| File / Item                                | Status | Notes                                                                                               |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| `scripts/run-benchmark.mjs`                | ✅     | Node wrapper that runs benchmark/run.py using the sidecar venv Python                               |
| `scripts/benchmark/run.py`                 | ✅     | CLI benchmark entry point — `--backend litert\|litert-cpp\|llamafile`, all scenarios, JSON+CSV output |
| `scripts/benchmark/backends/litert.py`     | ✅     | LiteRT adapter over WebSocket                                                                        |
| `scripts/benchmark/backends/litert_cpp.py` | ✅     | LiteRT C++ proxy adapter over the same Delfin WebSocket sidecar protocol                             |
| `scripts/benchmark/backends/llamafile.py`  | ✅     | llamafile adapter over OpenAI-compatible REST (streaming SSE)                                       |
| `scripts/benchmark/backends/memory.py`     | ✅     | Background RSS poller using psutil                                                                   |
| `scripts/benchmark/scenarios.py`           | ✅     | S1 (text), S2 (vision), S3 (multi-turn) scenario definitions                                         |
| `scripts/benchmark/reporter.py`            | ✅     | JSON + CSV result writer with mean±std stats                                                         |
| `scripts/benchmark/sysinfo.py`             | ✅     | Platform/CPU/RAM/GPU detection                                                                       |
| `scripts/benchmark/SETUP.md`               | ✅     | Setup and usage guide for LiteRT, LiteRT C++ proxy research, and llamafile examples                 |

### LiteRT-LM C++ bridge & proxy

| File / Item                                                                | Status | Notes                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/litert-cpp-presets.mjs`                                           | ✅     | JS preset registry used by the LiteRT C++ proxy; mirrors the current Python preset text                                                                                                                                                                                                                                          |
| `scripts/litert-cpp-proxy.mjs`                                             | ✅     | Delfin WebSocket proxy + health endpoint, validated against native `delfin_litert_bridge.exe`; text + vision turns stream successfully and optional Piper-backed sentence-level `audio_*` playback now works on this path, with sample-rate fallback from `PIPER_CONFIG`.                                                          |
| `scripts/litert-cpp-proxy.test.mjs`                                        | ✅     | Vitest coverage for health, token streaming/history, Piper audio ordering, early sentence-level audio, fallback behavior, sample-rate fallback, and interrupt forwarding                                                                                                                                                       |
| `native/litert-cpp-bridge/`                                                | ✅     | Source implements vision backend, image-blob decode, per-session KV-cache reuse, `reset_session`, and native audio-input wiring; Windows binary rebuilt and runtime-validated (S1/S2/S3 benchmark, KV-cache Turn 2+ ~647 ms, text/vision/audio paths). macOS/Linux native builds not yet attempted.                                |
| `native/litert-cpp-bridge/README.md`                                       | ✅     | Restructured 2026-05-04 around the "Linux / macOS / WSL2 default + `--native-windows` opt-in" policy: default Unix dev setup, two-terminal WSL2 + Windows host workflow, native-Windows opt-in checklist (VS 2022 Build Tools, `Hostx64\x64\cl.exe`, short Bazel output root). |
| `bin/delfin_litert_bridge` / `bin/delfin_litert_bridge.exe` (+ `libGemmaModelConstraintProvider.dll` on Windows) | ✅     | Gitignored local runtime artifacts from Bazel output. Windows variant only produced via `--native-windows` or CI.                                                                                                                                            |
| `scripts/build-litert-cpp-bridge.mjs`                                      | ✅     | Copies the Delfin bridge source/BUILD target into a pinned LiteRT-LM checkout and invokes Bazel. Desktop builds pass `--repo_env=ANDROID_NDK_HOME=` so ambient Android SDK/NDK installs on Windows CI do not trigger `@androidndk` registration. |
| `scripts/build-litert-cpp-bridge.test.mjs`                                 | ✅     | Vitest coverage for CLI/env parsing, BUILD target merge behavior, and the Android NDK repo-env guard used by desktop bridge builds. |
| `scripts/setup-litert-cpp.mjs`                                             | ✅     | One-shot orchestrator. Default behaviour on Windows now prints WSL2 setup instructions and exits; `--native-windows` opts into the existing Bazel + MSVC flow. Linux / macOS run the full clone + build + env + Piper + model flow with no platform-specific config. Idempotent; supports `--dry-run`, `--install-prereqs`, `--skip-build`, `--no-piper`, `--no-model`, `--native-windows`. Exposed as `npm run setup:litert-cpp`. |
| `scripts/setup-litert-cpp.test.mjs`                                        | ✅     | Vitest coverage for `parseArgs` (including new `--native-windows` flag) and `usage` output.                                                                                                                                                                  |
| Renderer/main wiring of LiteRT-CPP as default                              | ❌     | Tracked in `litert-cpp-primary-backend-migration-spec.md` (Gate 1 draft)                                                                                                                                                                                                                                                          |

### llamafile fallback (removed)

> **Removed 2026-05-03.** Superseded by the LiteRT-LM C++ backend for native Windows. The npm scripts (`setup:llamafile`, `dev:llamafile`, `benchmark:llamafile`) and source files (`scripts/setup-llamafile.mjs`, `scripts/run-llamafile.mjs`) have been deleted. The standalone Python benchmark adapter (`scripts/benchmark/backends/llamafile.py`) is retained for comparison runs only.

| File / Item                   | Status      | Notes                                                                                                    |
| ----------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `scripts/setup-llamafile.mjs` | ❌ Removed  | Deleted 2026-05-03. For llamafile benchmarks, install the binary manually and use the Python harness directly. |
| `scripts/run-llamafile.mjs`   | ❌ Removed  | Deleted 2026-05-03.                                                                                      |
| Electron main wiring          | ❌ Cancelled | llamafile was never wired into the app runtime; LiteRT-LM C++ is the native Windows backend.            |

---

## Distribution (`docs/features/distribution/`)

> Specs: [`desktop-distribution-mvp-spec.md`](docs/features/distribution/desktop-distribution-mvp-spec.md), [`distribution-backend-migration-spec.md`](docs/features/distribution/distribution-backend-migration-spec.md), [`distribution-packaging-spec.md`](docs/features/distribution/distribution-packaging-spec.md), [`distribution-cicd-spec.md`](docs/features/distribution/distribution-cicd-spec.md).

| Item                                                  | Status | Notes                                                                                       |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Distribution architecture decision                    | ✅     | `desktop-distribution-mvp-spec.md` Gate 1 approved; revised 2026-05-03 (LiteRT-LM C++ on Windows; llamafile removed) |
| Electron-builder config (`electron-builder.yml`)      | ❌     | Not started; tracked in `distribution-packaging-spec.md`                                    |
| First-run download orchestration (binaries + models)  | ❌     | Not started; tracked in `distribution-packaging-spec.md`                                    |
| NSIS / DMG / AppImage installers                      | ❌     | Not started                                                                                 |
| GitHub Actions matrix builds                          | ⚠️     | `.github/workflows/build-litert-cpp-bridge.yml` produces native bridge binaries (windows-x64, macos-arm64, linux-x64) on push / release / dispatch. The macOS arm64 lane now runs on `macos-15` so Bazel gets a newer Apple C++20 toolchain than the broken `macos-14` / Xcode 15.4 image. Windows bridge builds rely on `scripts/build-litert-cpp-bridge.mjs` clearing ambient Android NDK detection. Full electron-builder packaging matrix (`dist.yml`) still pending — tracked in `distribution-cicd-spec.md`. |
| `.github/workflows/build-litert-cpp-bridge.yml`       | ✅     | Matrix workflow building `delfin_litert_bridge` per platform against the `LITERT_LM_REF` pin in `scripts/setup-litert-cpp.mjs` (currently `v0.10.2`). Uploads workflow artifacts and attaches archives to GitHub Releases; macOS arm64 now targets `macos-15` to avoid the `cxx` C++20 build failure seen on `macos-14`. |
| Code signing (Windows Authenticode, macOS notarization) | ❌    | Not started                                                                                 |
| TTS backend strategy for packaged builds              | ❌     | DM3 in `distribution-backend-migration-spec.md` (Piper vs frozen Kokoro investigation)      |

---

## Memory (`docs/features/memory/`)

> Spec: [`memory-wiki-spec.md`](docs/features/memory/memory-wiki-spec.md). Sub-phases M0 → M3.

| Item                                                              | Status | Notes                                                                                  |
| ----------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| M0 — E2B viability spike (`sidecar/memory/spike.py`)              | ❌     | Spec written; standalone script not yet implemented                                    |
| M1 — Read-only wiki infrastructure (`store.py`, `index.py`, REST) | ❌     | Not started                                                                             |
| M2 — Session ingest pipeline                                      | ❌     | Not started                                                                             |
| M3 — File ingest + runtime tools + lint                           | ❌     | Not started                                                                             |
| Renderer `MemoryView` reader                                      | ❌     | Not started                                                                             |

---

## UI / UX (`docs/features/ui/`)

> Specs: [`waveform-ui-spec.md`](docs/features/ui/waveform-ui-spec.md), [`overlay-waveform-polish-spec.md`](docs/features/ui/overlay-waveform-polish-spec.md), [`minimized-overlay-waveform-continuity-spec.md`](docs/features/ui/minimized-overlay-waveform-continuity-spec.md).

All three feature specs are ✅ Complete. The implementation files (`VoiceWaveform`, waveform utilities, `MinimizedSessionBar`, expanded voice card) are listed in the [Voice pipeline + TTS](#voice-pipeline--tts) section above as part of the working app.

---

## Documentation — Explanation Docs

| File                                                       | Status | Notes                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/explanations/sidecar-flow.md`                        | ✅     | Refreshed 2026-04-22: removed Phase 1 stubs + respond_to_user tool section; added preprocess layer, message-ordering section, TTS flow                                                   |
| `docs/explanations/session-overlay-state-machine.md`       | ✅     | Refreshed 2026-04-22: fixed window dimensions (380×64 / 460×115 / 460×360); corrected resize-in-place vs destroy+recreate; window is always frameless                                    |
| `docs/explanations/electron-ipc-and-ws-message-flow.md`    | ✅     | Refreshed 2026-04-22: updated beginPromptSubmission/submitSessionPrompt signatures; added recordUserPrompt persistence step; corrected audio_start shape                                 |
| `docs/explanations/react-zustand-state-flow.md`            | ✅     | Refreshed 2026-04-22: settingsStore is not a stub; added minimizedResponseMessageId + sessionStartTime fields; expanded IPC cleanup channel list                                         |
| `docs/explanations/voice-audio-pipeline.md`                | ✅     | Refreshed 2026-04-22: screenshot taken in main process not renderer; updated submitSessionPrompt shape; corrected barge-in (mute + threshold + grace); audio_start has no sentence_count |
| `docs/explanations/screen-capture-and-window-filtering.md` | ✅     | No changes needed — consistent with current captureService implementation                                                                                                                |
