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
┌─────────────▼───────────────┐
│  Python FastAPI Sidecar     │
│  - LiteRT-LM Engine        │
│  - Gemma 4 E2B / E4B       │
│  - Tool calling (structured)│
│  - Vision (base64 blobs)    │
│  - TTS pipeline             │
│  - Interrupt handler        │
└─────────────────────────────┘
```

## Tech Stack

| Layer             | Technology                                                             |
| ----------------- | ---------------------------------------------------------------------- |
| Desktop framework | Electron 34+ via electron-vite                                         |
| Renderer          | React 19, TypeScript 5, Tailwind CSS 4                                 |
| State management  | Zustand 5                                                              |
| Validation        | Zod 3                                                                  |
| Inference engine  | LiteRT-LM ≥ 0.10.1 (Python API)                                        |
| Model             | Gemma 4 E2B (default) or E4B (32 GB machines)                          |
| API server        | FastAPI + uvicorn                                                      |
| TTS               | kokoro-onnx (Linux/WSL2), mlx-audio (macOS), Web Speech API (fallback) |
| WebSocket         | ws (Node.js client), FastAPI built-in (server)                         |

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

These are the supported configuration variables. `.env.example` must include all of them with documented defaults.

```env
# === Model ===
MODEL_REPO=litert-community/gemma-4-E2B-it-litert-lm
MODEL_FILE=gemma-4-E2B-it.litertlm

# === Sidecar ===
SIDECAR_HOST=0.0.0.0
SIDECAR_PORT=8321

# === Electron ===
SIDECAR_WS_URL=ws://localhost:8321/ws

# === Inference ===
LITERT_BACKEND=CPU
LITERT_CACHE_DIR=/tmp/litert-cache
VISION_TOKEN_BUDGET=280
MAX_IMAGE_WIDTH=512

# === LiteRT-LM C++ research backend ===
LITERT_CPP_BIN=./bin/delfin_litert_bridge.exe
LITERT_CPP_MODEL=./models/gemma-4-E2B-it.litertlm
LITERT_CPP_TTS_BACKEND=none
PIPER_BIN=./bin/piper/piper.exe
PIPER_MODEL=./models/piper/en_US-lessac-medium.onnx
PIPER_CONFIG=./models/piper/en_US-lessac-medium.onnx.json
# Optional override; if omitted, the LiteRT C++ proxy reads audio.sample_rate
# from PIPER_CONFIG. `npm run voice:use` writes this automatically.
PIPER_SAMPLE_RATE=22050

# LITERT_CPP_BIN must point at the Delfin JSONL/stdio bridge built from
# native/litert-cpp-bridge/ (delfin_litert_bridge[.exe]). The upstream
# litert_lm_main demo CLI is not a drop-in replacement — it does not speak
# the Delfin JSONL protocol.
#
# For packaged Windows builds, LITERT_CPP_BIN points at the bundled prebuilt
# delfin_litert_bridge.exe resource and LITERT_CPP_MODEL points at the user's
# first-run-downloaded .litertlm model under app.getPath('userData').

# === TTS ===
TTS_ENABLED=false
TTS_BACKEND=web-speech
KOKORO_VOICE=af_heart
KOKORO_SPEED=1.1
```

For `npm run dev:litert-cpp`, `TTS_BACKEND` does **not** control proxy speech output. Use `LITERT_CPP_TTS_BACKEND=piper` plus the `PIPER_*` paths to enable off-Python audio on the LiteRT C++ proxy; `npm run voice:list`, `npm run voice:use -- <voice-name>`, and `npm run voice:install -- <hf-path> --use` manage local Piper voice files and `.env`. If Piper is disabled, misconfigured, or omitted, the renderer falls back to Web Speech after `done`.

## WebSocket Message Protocol

All messages between Electron and the sidecar are JSON. These types are the contract.

### Outbound (Electron → Sidecar)

```typescript
// Inference request
interface WsOutboundMessage {
  image?: string; // base64 JPEG
  text: string; // user question
  preset_id: string; // 'lecture-slide' | 'generic-screen'
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
    | "structured"
    | "audio_start"
    | "audio_chunk"
    | "audio_end"
    | "done"
    | "error";
  text?: string; // for 'token'
  data?: {
    // for 'structured'
    summary: string;
    answer: string;
    key_points: string[];
  };
  audio?: string; // for 'audio_chunk' — base64 int16 PCM
  sample_rate?: number; // for 'audio_start' — PCM sample rate
  sentence_count?: number; // for 'audio_start' — optional sentence metadata (proxy may send 0 when unknown)
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
| Main → Renderer | `sidecar:structured`        | `{ summary, answer, key_points }`                          |
| Main → Renderer | `sidecar:audio_start`       | `{ sampleRate: number, sentenceCount: number }`            |
| Main → Renderer | `sidecar:audio_chunk`       | `{ audio: string, index?: number }`                        |
| Main → Renderer | `sidecar:audio_end`         | `{ ttsTime: number }`                                      |
| Main → Renderer | `sidecar:done`              | —                                                          |
| Main → Renderer | `overlay:error`             | `{ message: string }`                                      |
| Main → Renderer | `sidecar:error`             | `{ message: string }`                                      |
| Main → Renderer | `sidecar:status`            | `{ connected: boolean, backend?: string, model?: string }` |
