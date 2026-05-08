# Delfin — Implementation Status

> Last updated: 2026-05-08 (Piper TTS binary and voice model now downloaded at first run via `assetManager.ts`; standalone binary replaces bundled Python venv in packaged builds; download button shows immediate loading state; versioning convention established at v0.0.1.)
> Legend: ✅ Implemented · ⚠️ Placeholder (file exists, no real logic) · ❌ Not started
>
> Sections below mirror [`docs/README.md`](docs/README.md): one block of "Foundations" (the hackathon MVP, now in maintenance) followed by one block per active feature area under `docs/features/`. The original per-phase tables were collapsed when the project moved off numbered phases on 2026-05-03 — see [`docs/archive/hackathon-mvp.md`](docs/archive/hackathon-mvp.md).

---

# Foundations (Hackathon MVP)

The current shipping app. Originally tracked as Phases 0–6; preserved here as the working baseline that newer features build on top of.

## Project scaffold & build tooling

| File / Item                                                                  | Status | Notes                                                                                                                   |
| ---------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Electron + Vite + React + TypeScript scaffold                                | ✅     | `electron.vite.config.ts`, `package.json` (v0.0.1; versioned via `npm version`, see AGENTS.md §Versioning)              |
| `.env.example` + dotenv loading                                              | ✅     | Shared env contract for Electron, sidecar, voice/TTS settings, and LiteRT C++ bridge paths. LiteRT C++ proxy comments now document the repo-local `piper-tts` runtime path (`bin/piper/venv`) and automatic setup behavior. |
| `src/shared/types.ts`                                                        | ✅     | IPC, WebSocket, session history, overlay, and audio-bearing turn types                                                  |
| `src/shared/schemas.ts`                                                      | ✅     | Zod validation for WS and session prompt contracts                                                                      |
| `src/shared/constants.ts`                                                    | ✅     | Presets, sidebar constants, `VOICE_TURN_TEXT`                                                                           |
| `scripts/mock-sidecar.js`                                                    | ✅     | Mock sidecar for Electron/UI work                                                                                       |
| `scripts/run-sidecar.mjs`                                                    | ✅     | Helper script used by `npm run dev:sidecar` / `dev:full`                                                                |
| `scripts/init-env.mjs`, `scripts/setup-sidecar.mjs`, `scripts/check-env.mjs` | ✅     | One-command setup and env validation                                                                                    |
| `scripts/download-models.mjs`                                                | ✅     | Atomic Kokoro/model download flow with temp `.part` files, retry/resume support, byte-count validation when available, and shared use by LiteRT C++ setup. |
| `scripts/download-models.test.mjs`                                           | ✅     | Vitest coverage for safe model download behavior                                                                        |
| `scripts/check-vad-runtime.mjs`                                              | ✅     | Verifies copied VAD/ORT runtime assets                                                                                  |
| `scripts/windows/common.ps1`                                                 | ✅     | Shared PowerShell helpers for Windows-only scripts: repo-root resolution, `.env` parsing/upserting, and npm path lookup. |
| `scripts/setup-check.sh` / `scripts/windows/setup-check.ps1`                 | ✅     | Environment validation helpers for Unix shells and native Windows PowerShell, including LiteRT C++ bridge/model sanity checks on Windows; the PowerShell helper now also reports Piper runtime + voice readiness. |
| `README.md`                                                                  | ✅     | User-facing setup guide. LiteRT C++ setup/docs now describe one-shot native Windows provisioning, bridge artifact/source fallback order, repo-local pinned `piper-tts`, automatic Piper voice provisioning, and browser-speech fallback. |
| `docs/README.md`                                                             | ✅     | Documentation index now includes a dedicated setup & validation guides section for macOS, Linux / WSL2, and Windows. |

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
| `src/main/sidecar/healthCheck.ts`                                  | ✅     | `/health` polling implemented; forwards healthy status to renderer via `sidecar:status` |
| `src/main/sidecar/backendProcess.ts`                                | ✅     | Logic to spawn `litert-cpp-proxy.mjs` in packaged or explicit dev mode                |
| `src/main/sidecar/assetManager.ts`                                  | ✅     | Manages `manifest.json`; downloads `litert-cpp-model` from HuggingFace, `piper-bin` (standalone binary from GitHub releases, platform-specific zip/tar.gz extraction), and `piper-voice` (ONNX + config from HuggingFace); migrates existing manifests to add new Piper entries |
| `src/main/ipc/modelHandlers.ts`                                     | ✅     | IPC handlers for model status and first-run asset downloads; emits `MODELS_STATUS` immediately on download start so renderer shows loading state |
| `src/renderer/features/setup/SetupScreen.tsx`                       | ✅     | First-run download progress UI; disabled button with inline "Downloading..." label; human-friendly asset names for all three asset IDs |

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
| `.env.example` — TTS and voice settings                                            | ✅     | Documents `VOICE_ENABLED`, `TTS_ENABLED`, `TTS_BACKEND`, Kokoro settings, `LITERT_AUDIO_BACKEND`, LiteRT C++ proxy Piper env vars, soft partial TTS flush tuning, the repo-local Piper runtime path, and voice helper commands |
| `scripts/piper-voice.mjs`                                                          | ✅     | Piper helper now manages both the repo-local pinned `piper-tts` runtime bootstrap (`bin/piper/venv`) and official `rhasspy/piper-voices` downloads, repairs missing runtime companion packages (`pathvalidate`), and preserves `.env` wiring/sample-rate detection. |
| `scripts/piper-voice.test.mjs`                                                     | ✅     | Vitest coverage for runtime bootstrap/reuse/repair, path parsing, local voice listing, `.env` switching, mocked downloads, and proxy sample-rate fallback |
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
| `scripts/litert-cpp-proxy.mjs`                                             | ✅     | Delfin WebSocket proxy + health endpoint, validated against native `delfin_litert_bridge.exe`; text + vision turns stream successfully and optional Piper-backed `audio_*` playback now works on completed sentences plus conservative long partial chunks before `done`, with sample-rate fallback from `PIPER_CONFIG` and a default Piper runtime path under `bin/piper/venv`.                                                          |
| `scripts/litert-cpp-proxy.test.mjs`                                        | ✅     | Vitest coverage for health, token streaming/history, Piper audio ordering, early sentence-level audio, early long-partial audio, fallback behavior, sample-rate fallback, and interrupt forwarding                                                                                                                                                       |
| `native/litert-cpp-bridge/`                                                | ✅     | Source implements vision backend, image-blob decode, per-session KV-cache reuse, `reset_session`, and native audio-input wiring; Windows binary rebuilt and runtime-validated (S1/S2/S3 benchmark, KV-cache Turn 2+ ~647 ms, text/vision/audio paths). macOS/Linux native builds not yet attempted.                                |
| `native/litert-cpp-bridge/README.md`                                       | ✅     | Documents artifact-first setup for Windows x64 / macOS arm64 / Linux x64 plus backend-developer source-build opt-in via `--source-build`. |
| `bin/delfin_litert_bridge` / `bin/delfin_litert_bridge.exe` (+ `libGemmaModelConstraintProvider.dll` on Windows) | ✅     | Gitignored local runtime artifacts from Bazel output. Windows variant only produced via `--native-windows` or CI.                                                                                                                                            |
| `scripts/build-litert-cpp-bridge.mjs`                                      | ✅     | Copies the Delfin bridge source/BUILD target into a pinned LiteRT-LM checkout and invokes Bazel. Desktop builds pass `--repo_env=ANDROID_NDK_HOME=` so ambient Android SDK/NDK installs on Windows CI do not trigger `@androidndk` registration. |
| `scripts/build-litert-cpp-bridge.test.mjs`                                 | ✅     | Vitest coverage for CLI/env parsing, BUILD target merge behavior, and the Android NDK repo-env guard used by desktop bridge builds. |
| `docs/features/backend/testing-guide-macos.md`                             | ✅     | Full macOS native-backend setup + validation runbook linked from README. |
| `docs/features/backend/testing-guide-linux.md`                             | ✅     | Full Linux x64 / WSL2 native-backend setup + validation runbook linked from README. |
| `docs/guides/testing-guide-windows.md`                                     | ✅     | Full Windows runbook covering WSL2, native artifact-first `setup:litert-cpp`, optional CI-artifact smoke tests, backend-developer local source builds, model/Piper provisioning, and `/health` validation. |
| `scripts/windows/download-ci-bridge.ps1`                                   | ✅     | Native Windows helper that downloads `delfin-litert-bridge-windows-x64` from the latest successful `build-litert-cpp-bridge.yml` run (or a specified run) via `gh`, stages the exe + DLL into `bin/`, and prints the exact `winget` + `gh auth login` steps when GitHub CLI is missing. |
| `scripts/windows/test-ci-bridge.ps1`                                       | ✅     | Native Windows helper that verifies the downloaded bridge files, ensures `.env` points at them, defaults LiteRT model downloads to Python `huggingface_hub`, then falls back to Windows BITS and repeated `curl.exe` retry/resume/progress attempts with `.part` safety + byte-count validation, starts `npm run dev:litert-cpp`, waits for `/health`, and can run `benchmark:litert-cpp`. |
| `scripts/setup-litert-cpp.mjs`                                             | ✅     | One-shot orchestrator. Default bridge provisioning is now existing files → matching CI workflow artifact via `gh` for Windows x64 / macOS arm64 / Linux x64, then model + repo-local Piper runtime repair + default voice + `.env`; source builds require `--source-build` or `--bridge-source build`. |
| `scripts/setup-litert-cpp.test.mjs`                                        | ✅     | Vitest coverage for argument parsing, artifact-first bridge-source planning across Windows/macOS/Linux, platform artifact names, source-build opt-in, skip-build planning, and usage output.                                                                                                                                                                  |
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
| Distribution architecture decision                    | ✅     | `desktop-distribution-mvp-spec.md` Gate 1 approved; **revised 2026-05-06** (LiteRT-LM C++ on Windows x64, macOS arm64, Linux x64; Python sidecar deprecated for distribution) |
| Electron-builder config (`package.json`)             | ✅     | Configured for Windows (NSIS), macOS (DMG), and Linux (AppImage); includes bridge binaries as `extraResources` |
| First-run download orchestration (binaries + models)  | ✅     | `assetManager.ts` + `SetupScreen.tsx` implemented; downloads `litert-cpp-model` (.litertlm), `piper-bin` (standalone binary, no Python needed), and `piper-voice` (ONNX + config); `bin/piper` and `models/piper` removed from `extraResources` |
| NSIS / DMG / AppImage installers                      | ❌     | Not started                                                                                 |
| GitHub Actions matrix builds                          | ⚠️     | `.github/workflows/build-litert-cpp-bridge.yml` produces native bridge binaries (windows-x64, macos-arm64, linux-x64). `dist.yml` spec updated 2026-05-06 to download prebuilt bridge artifacts for all 3 platforms. Full `dist.yml` packaging matrix still pending approval — tracked in `distribution-cicd-spec.md`. |
| `.github/workflows/build-litert-cpp-bridge.yml`       | ✅     | Matrix workflow building `delfin_litert_bridge` per platform against the `LITERT_LM_REF` pin in `scripts/setup-litert-cpp.mjs` (currently `v0.10.2`). Uploads workflow artifacts and attaches archives to GitHub Releases. |
| Code signing (Windows Authenticode, macOS notarization) | ❌    | Not started                                                                                 |
| TTS backend strategy for packaged builds              | ✅     | **Resolved 2026-05-08**: Standalone Piper binary downloaded at first run on all three platforms; no Python required on user machine. `LITERT_CPP_TTS_BACKEND=piper` set by `backendProcess.ts` when downloaded assets are present; falls back to `none` (Web Speech in renderer) if missing. |

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
