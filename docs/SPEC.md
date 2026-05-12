# Delfin — Implementation Spec

> **Purpose**: This spec is the single source of truth for the architecture, interface contracts, and cross-cutting code rules that every feature in Delfin must respect. Per-feature scope, acceptance criteria, and verification checklists live in the individual specs under [`docs/features/<area>/`](./features/) and are tracked in [`STATUS.md`](../STATUS.md). The original numbered hackathon phases (0–6) were consolidated into [`archive/hackathon-mvp.md`](./archive/hackathon-mvp.md) on 2026-05-03.

## What is Delfin?

A desktop AI sidebar that captures your screen, sends the image to a local LLM (Gemma 4 via LiteRT-LM), and displays a structured explanation — all running on-device with no cloud, no login, and no API costs. The primary demo is a **Lecture Slide Explainer** that summarises slides, explains jargon, and generates quiz questions.

## Architecture Overview

```
┌─────────────────────────────┐
│  User's App (Slides, etc.)  │
└─────────────┬───────────────┘
              │ (foreground window)
┌─────────────▼───────────────┐
│  Electron Main Process      │
│  - desktopCapturer          │
│  - WebSocket client         │
│  - Auto-refresh + debounce  │
│  - IPC bridge               │
└─────────────┬───────────────┘
              │ IPC (contextBridge)
┌─────────────▼───────────────┐
│  Electron Renderer (React)  │
│  - Sidebar overlay (420px)  │
│  - Chat panel (streaming)   │
│  - Capture preview          │
│  - Quick actions             │
│  - Stop button              │
│  - Status indicator         │
└─────────────────────────────┘
              │
        WebSocket (localhost:8321/ws)
              │
┌─────────────▼────────────────┐   JSONL/stdio
│  Node.js WebSocket Proxy     │◄──────────────►  delfin_litert_bridge (C++)
│  scripts/litert-cpp-proxy.mjs│                  LiteRT-LM engine
│  - Preset resolution         │                  Gemma 4 E2B / E4B
│  - Piper TTS pipeline        │                  Vision + audio input
│  - Session / interrupt mgmt  │                  KV-cache per session
└──────────────────────────────┘

  [Deprecated] Python FastAPI Sidecar (sidecar/server.py)
    LiteRT-LM Python API · Kokoro/MLX TTS
    Still reachable on the same ws://localhost:8321/ws endpoint
    for developer reference; not used in packaged builds.
```

## Tech Stack

| Layer             | Technology                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| Desktop framework | Electron 41+ via electron-vite                                                    |
| Renderer          | React 19, TypeScript 6, Tailwind CSS 4                                            |
| State management  | Zustand 5                                                                         |
| Validation        | Zod 4                                                                             |
| Inference engine  | LiteRT-LM C++ bridge (primary — all platforms); Python API (deprecated)           |
| Model             | Gemma 4 E2B (default) or E4B (32 GB machines)                                     |
| API server        | Node.js WebSocket proxy (`litert-cpp-proxy.mjs`); FastAPI + uvicorn (deprecated)  |
| TTS               | Piper TTS via litert-cpp-proxy (primary); Web Speech API (fallback)               |
| WebSocket         | ws (Node.js client + proxy server)                                                |

## Active Work Map

The hackathon-era numbered phase sequence (Phase 0 scaffold → Phase 6 polish) is complete and archived. New work is organised by feature area; each spec carries its own scope and verification checklist.

| Area         | Folder                                                     | Headline                                                                                                                                                                |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations  | n/a — shipping app                                         | Hackathon MVP (Electron shell + Python LiteRT sidecar + voice/TTS pipeline). See [`STATUS.md`](../STATUS.md#foundations-hackathon-mvp) and [`archive/hackathon-mvp.md`](./archive/hackathon-mvp.md). |
| Backend      | [`features/backend/`](./features/backend/)                 | Native LiteRT-LM C++ bridge (text/vision/audio/KV-cache validated on Windows; macOS/Linux pending) and the inference benchmark harness.                                |
| Distribution | [`features/distribution/`](./features/distribution/)       | Desktop packaging (electron-builder, signed installers), backend selection for distribution, GitHub Actions CI/CD.                                                       |
| Memory       | [`features/memory/`](./features/memory/)                   | On-device LLM wiki with internal sub-phases M0–M3.                                                                                                                       |
| UI / UX      | [`features/ui/`](./features/ui/)                           | Waveform / overlay polish — all specs ✅ Complete; area is in maintenance.                                                                                              |

See [`docs/README.md`](./README.md) for the full per-spec index with lifecycle status.

## Cross-Cutting Rules

These rules apply to every feature. The agent must follow them throughout.

### Code Style

- TypeScript for all Electron code (strict mode)
- Python 3.12+ for all sidecar code
- Use ES modules in TypeScript, standard Python imports
- No `any` types in TypeScript — use proper types or `unknown`
- All WebSocket message types defined in `src/shared/types.ts` and validated with Zod schemas in `src/shared/schemas.ts`

### File Naming

- TypeScript: camelCase files (e.g., `captureService.ts`)
- React components: PascalCase files (e.g., `ChatPanel.tsx`)
- Python: snake_case files (e.g., `server.py`)
- CSS: `globals.css` only (Tailwind utility classes, no component CSS files)

### Configuration

- All machine-specific values come from `.env` (never hardcoded)
- `.env.example` is committed; `.env` is gitignored
- Python reads `.env` via `python-dotenv`; Electron reads via `dotenv` package

### Error Handling

- Never let an unhandled exception crash the sidecar — catch and return `{type: 'error', message: '...'}` over WebSocket
- Electron main process: catch errors in IPC handlers, log and forward to renderer
- Renderer: display errors inline in the chat panel, not in alert dialogs

### Git

- `.gitignore` must include: `node_modules/`, `dist/`, `.env`, `__pycache__/`, `*.pyc`, `.venv/`
- Each phase should result in a working (if incomplete) application

## Environment Variables (.env)

`.env.example` is the authoritative reference for all configuration variables. Key variables are summarised here; see `.env.example` for full comments and the complete set.

```env
# === Model ===
MODEL_REPO=litert-community/gemma-4-E2B-it-litert-lm
# MODEL_FILE is legacy — setup scripts use MODEL_REPO for HuggingFace downloads
MODEL_FILE=gemma-4-E2B-it.litertlm
# MODEL_REVISION pins the HuggingFace commit SHA — must be bumped with LITERT_LM_REF

# === Sidecar ===
SIDECAR_HOST=0.0.0.0
SIDECAR_PORT=8321

# === Electron ===
SIDECAR_WS_URL=ws://localhost:8321/ws

# === Inference ===
# Dev default: litert (Python sidecar). M5a will flip to litert-cpp on all platforms.
INFERENCE_BACKEND=litert
LITERT_BACKEND=CPU
LITERT_AUDIO_BACKEND=CPU
VISION_TOKEN_BUDGET=280
MAX_IMAGE_WIDTH=512

# === Voice input ===
VOICE_ENABLED=true

# === LiteRT-LM C++ bridge (primary backend) ===
# LITERT_CPP_BIN must point at delfin_litert_bridge[.exe] from native/litert-cpp-bridge/
LITERT_CPP_BIN=./bin/delfin_litert_bridge.exe
LITERT_CPP_MODEL=./models/gemma-4-E2B-it.litertlm
LITERT_CPP_TTS_BACKEND=piper   # piper | none (none → renderer Web Speech fallback)
LITERT_CPP_TTS_SOFT_MIN_CHARS=80
LITERT_CPP_TTS_SOFT_MAX_CHARS=180
PIPER_BIN=./bin/piper/venv/Scripts/piper.exe
PIPER_MODEL=./models/piper/en_US-hfc_female-medium.onnx
PIPER_CONFIG=./models/piper/en_US-hfc_female-medium.onnx.json
PIPER_SAMPLE_RATE=22050  # optional; proxy reads audio.sample_rate from PIPER_CONFIG when absent

# === TTS (deprecated Python sidecar path only) ===
TTS_ENABLED=true
TTS_BACKEND=kokoro   # kokoro | mlx | web-speech
KOKORO_VOICE=af_heart
KOKORO_SPEED=1.1
```

On `npm run dev:backend`, `TTS_BACKEND` and `TTS_ENABLED` have **no effect** — those variables control the deprecated Python sidecar. TTS for the C++ proxy is controlled by `LITERT_CPP_TTS_BACKEND`. Piper sentences flush on punctuation boundaries; `LITERT_CPP_TTS_SOFT_MIN_CHARS` / `LITERT_CPP_TTS_SOFT_MAX_CHARS` allow soft partial flushes for long text without punctuation.

`npm run setup:litert-cpp` is the one-shot setup command for all platforms — it downloads the CI-built bridge artifact (or rebuilds from source via `--source-build`), provisions the Gemma 4 model, bootstraps the repo-local Piper runtime, installs the default voice, and writes `.env`. `LITERT_CPP_BRIDGE_REPO` overrides the GitHub repo for artifact lookup. Voice management: `npm run voice:list`, `voice:use -- <voice-name>`, `voice:install -- <hf-path> --use`. If Piper is disabled, misconfigured, or omitted, the renderer falls back to Web Speech after `done`.

`LITERT_LM_REF` (in `scripts/setup-litert-cpp.mjs`) and `MODEL_REVISION` must always be bumped together when upgrading the bridge — see `AGENTS.md` §Validated Technical Decisions for the exact procedure.

## WebSocket Message Protocol

All messages between Electron and the sidecar are JSON. These types are the contract.

### Outbound (Electron → Sidecar)

```typescript
// Inference request
interface WsOutboundMessage {
  image?: string; // base64 JPEG
  text: string; // user question or VOICE_TURN_TEXT constant
  preset_id: string; // 'lecture-slide' | 'generic-screen'
  audio?: string; // base64 WAV (voice turns only — 16 kHz, 16-bit mono)
}

// Interrupt
interface WsInterruptMessage {
  type: "interrupt";
}
```

### Inbound (Sidecar → Electron)

```typescript
interface WsInboundMessage {
  type:
    | "token"
    | "audio_start"
    | "audio_chunk"
    | "audio_end"
    | "done"
    | "error";
  text?: string; // for 'token'
  audio?: string; // for 'audio_chunk' — base64 int16 PCM
  sample_rate?: number; // for 'audio_start' — PCM sample rate
  sentence_count?: number; // for 'audio_start' — proxy may send 0 when unknown
  index?: number; // for 'audio_chunk' — sentence index
  tts_time?: number; // for 'audio_end' — synthesis time in seconds
  message?: string; // for 'error'
}
```

For turns with server-side TTS (Python sidecar or Piper-backed LiteRT C++ proxy), message ordering is:

```text
token* → audio_start → audio_chunk* → audio_end → done
```

This means `done` represents the end of the full turn, not just the end of token streaming.

The `done` event from the proxy to Electron has no extra fields — `{"type":"done"}`. The proxy accumulates `streamedText` from token events and uses it for TTS and downstream logic; the bridge's internal `done` JSONL event does not echo text. See `AGENTS.md` §Validated Technical Decisions (Bridge-minimal design) for the rationale.

### IPC Channels (Electron Main ↔ Renderer)

| Direction       | Channel                     | Payload                                                    |
| --------------- | --------------------------- | ---------------------------------------------------------- |
| Renderer → Main | `capture:now`               | —                                                          |
| Renderer → Main | `capture:auto-refresh`      | `{ enabled: boolean, intervalMs: number }`                 |
| Renderer → Main | `sidecar:send`              | `WsOutboundMessage`                                        |
| Renderer → Main | `sidecar:interrupt`         | —                                                          |
| Renderer → Main | `session:start`             | —                                                          |
| Renderer → Main | `session:stop`              | —                                                          |
| Renderer → Main | `session:submit-prompt`     | `SessionPromptRequest`                                     |
| Renderer → Main | `session:list`              | —                                                          |
| Renderer → Main | `session:get-detail`        | `{ sessionId: string }`                                    |
| Renderer → Main | `session:delete`            | `{ sessionId: string }`                                    |
| Renderer → Main | `session:get-message-image` | `{ imagePath: string }`                                    |
| Main → Renderer | `frame:captured`            | `CaptureFrame`                                             |
| Main → Renderer | `sidecar:token`             | `{ text: string }`                                         |
| Main → Renderer | `sidecar:audio_start`       | `{ sampleRate: number, sentenceCount: number }`            |
| Main → Renderer | `sidecar:audio_chunk`       | `{ audio: string, index?: number }`                        |
| Main → Renderer | `sidecar:audio_end`         | `{ ttsTime: number }`                                      |
| Main → Renderer | `sidecar:done`              | —                                                          |
| Main → Renderer | `overlay:error`             | `{ message: string }`                                      |
| Main → Renderer | `sidecar:error`             | `{ message: string }`                                      |
| Main → Renderer | `sidecar:status`            | `{ connected: boolean, backend?: string, model?: string }` |
| Renderer → Main | `models:get-status`         | —                                                          |
| Renderer → Main | `models:download`           | `{ assets?: ModelAssetId[] }`                              |
| Main → Renderer | `models:status`             | `ModelStatus`                                              |
| Main → Renderer | `models:download-progress`  | `DownloadProgress`                                         |
| Main → Renderer | `models:download-complete`  | `{ asset: ModelAssetId }`                                  |
| Main → Renderer | `models:download-error`     | `{ asset?: ModelAssetId, message: string }`                |

`ModelAssetId = 'litert-cpp-model' | 'piper-bin' | 'piper-voice'`. `ModelStatus = { ready: boolean, missing: ModelAssetId[], downloadInProgress: boolean }`. `DownloadProgress = { asset: ModelAssetId, receivedBytes: number, totalBytes?: number, percent?: number }`. These channels drive the first-run asset download flow (`SetupScreen.tsx`, `modelHandlers.ts`).

## HTTP Endpoints

The Node WebSocket proxy (`scripts/litert-cpp-proxy.mjs`) exposes one HTTP endpoint on the same port (8321):

| Method | Path      | Response                                                            |
| ------ | --------- | ------------------------------------------------------------------- |
| `GET`  | `/health` | `{ status: "ok", backend: string, model: string }` (200) or error object (500) |

`src/main/sidecar/healthCheck.ts` polls this endpoint after spawn to confirm the bridge is ready before the renderer is shown. The deprecated Python FastAPI sidecar exposes the same `/health` path with an extended payload (`model_loaded`, vision token budget, etc.).
