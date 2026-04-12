# Delfin — Implementation Spec

> **Purpose**: This spec is the single source of truth for an AI coding agent building Delfin from an empty repo. Each phase is self-contained, builds on the previous, and ends with a verification checklist. Complete one phase at a time; wait for human review before starting the next.

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

| Layer | Technology |
|---|---|
| Desktop framework | Electron 34+ via electron-vite |
| Renderer | React 19, TypeScript 5, Tailwind CSS 4 |
| State management | Zustand 5 |
| Validation | Zod 3 |
| Inference engine | LiteRT-LM ≥ 0.10.1 (Python API) |
| Model | Gemma 4 E2B (default) or E4B (32 GB machines) |
| API server | FastAPI + uvicorn |
| TTS | kokoro-onnx (Linux/WSL2), mlx-audio (macOS), Web Speech API (fallback) |
| WebSocket | ws (Node.js client), FastAPI built-in (server) |

## Phase Map

| Phase | Name | What Gets Built | Depends On |
|---|---|---|---|
| 0 | [Project Scaffold](./phases/phase-0-scaffold.md) | Repo structure, configs, .env, dependencies, setup scripts | Nothing |
| 1 | [Inference Sidecar](./phases/phase-1-sidecar.md) | FastAPI server, LiteRT-LM engine, tool calling, image preprocessing | Phase 0 |
| 2 | [Electron Shell + Capture](./phases/phase-2-electron.md) | Overlay window, desktopCapturer, WebSocket client, IPC handlers | Phase 0 |
| 3 | [React Sidebar UI](./phases/phase-3-ui.md) | All React components, Zustand stores, streaming display | Phase 2 |
| 4 | [End-to-End Integration](./phases/phase-4-integration.md) | Wire all three layers together, error handling, status reporting | Phases 1–3 |
| 5 | [Auto-Refresh + TTS](./phases/phase-5-autorefresh-tts.md) | Auto-refresh with debounce, TTS pipeline, audio playback | Phase 4 |
| 6 | [Polish + Optimisation](./phases/phase-6-polish.md) | Styling, error states, perf optimisations, demo prep | Phase 5 |

## Cross-Cutting Rules

These rules apply to every phase. The agent must follow them throughout.

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

# === TTS ===
TTS_ENABLED=false
TTS_BACKEND=web-speech
KOKORO_VOICE=af_heart
KOKORO_SPEED=1.1
```

## WebSocket Message Protocol

All messages between Electron and the sidecar are JSON. These types are the contract.

### Outbound (Electron → Sidecar)

```typescript
// Inference request
interface WsOutboundMessage {
  image?: string;      // base64 JPEG
  text: string;        // user question
  preset_id: string;   // 'lecture-slide' | 'generic-screen'
}

// Interrupt
interface WsInterruptMessage {
  type: 'interrupt';
}
```

### Inbound (Sidecar → Electron)

```typescript
interface WsInboundMessage {
  type: 'token' | 'structured' | 'audio_start' | 'audio_chunk' | 'audio_end' | 'done' | 'error';
  text?: string;       // for 'token'
  data?: {             // for 'structured'
    summary: string;
    answer: string;
    key_points: string[];
  };
  audio?: string;      // for 'audio_chunk' — base64 int16 PCM
  sample_rate?: number;    // for 'audio_start' — PCM sample rate
  sentence_count?: number; // for 'audio_start' — number of sentence chunks
  index?: number;          // for 'audio_chunk' — sentence index
  tts_time?: number;       // for 'audio_end' — synthesis time in seconds
  message?: string;    // for 'error'
}
```

For turns with server-side TTS, message ordering is:

```text
token* → audio_start → audio_chunk* → audio_end → done
```

This means `done` represents the end of the full turn, not just the end of token streaming.

### IPC Channels (Electron Main ↔ Renderer)

| Direction | Channel | Payload |
|---|---|---|
| Renderer → Main | `capture:now` | — |
| Renderer → Main | `capture:auto-refresh` | `{ enabled: boolean, intervalMs: number }` |
| Renderer → Main | `sidecar:send` | `WsOutboundMessage` |
| Renderer → Main | `sidecar:interrupt` | — |
| Renderer → Main | `session:start` | — |
| Renderer → Main | `session:stop` | — |
| Renderer → Main | `session:submit-prompt` | `SessionPromptRequest` |
| Renderer → Main | `session:list` | — |
| Renderer → Main | `session:get-detail` | `{ sessionId: string }` |
| Renderer → Main | `session:delete` | `{ sessionId: string }` |
| Renderer → Main | `session:get-message-image` | `{ imagePath: string }` |
| Main → Renderer | `frame:captured` | `CaptureFrame` |
| Main → Renderer | `sidecar:token` | `{ text: string }` |
| Main → Renderer | `sidecar:structured` | `{ summary, answer, key_points }` |
| Main → Renderer | `sidecar:audio_start` | `{ sampleRate: number, sentenceCount: number }` |
| Main → Renderer | `sidecar:audio_chunk` | `{ audio: string, index?: number }` |
| Main → Renderer | `sidecar:audio_end` | `{ ttsTime: number }` |
| Main → Renderer | `sidecar:done` | — |
| Main → Renderer | `overlay:error` | `{ message: string }` |
| Main → Renderer | `sidecar:error` | `{ message: string }` |
| Main → Renderer | `sidecar:status` | `{ connected: boolean, backend?: string, model?: string }` |
