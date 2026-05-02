# Distribution — Backend Migration Spec

> Gate 1 spec — awaiting approval before implementation.
> Part of the Desktop Distribution MVP track. Read `desktop-distribution-mvp-spec.md` first.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | Gate 1 — awaiting approval |
| **Created** | 2026-05-01 |
| **Revised** | 2026-05-02 (see revision section below) |
| **Depends on** | Inference benchmark results (`inference-benchmarking-spec.md`) reviewed and accepted |
| **Blocks** | `distribution-packaging-spec.md` (packaging requires a working cross-platform backend) |

## Revision — 2026-05-02

The original spec assumed a **full replacement** of LiteRT-LM with llama-server across all platforms. This is incorrect for the approved architecture.

**Approved architecture (Path 2 — hybrid):**

- **LiteRT-LM** remains the primary backend on macOS, Linux, and Windows + WSL2. It is faster, Gemma-4-optimised, and maintains a KV cache that makes follow-up turns near-instant.
- **llamafile** is the fallback backend for Windows users without WSL2, where LiteRT-LM has no native wheel.

The implementation is therefore **additive**, not a replacement. The existing `wsClient.ts` and Python sidecar are unchanged. A new llamafile client sits alongside them; a backend selector in `sidecarBridge.ts` chooses which path to activate at startup.

---

## Goal

Add a llamafile integration path to the Electron main process so that users on native Windows (no WSL2) can run the full app — inference, screen capture, and (eventually) TTS — without WSL2 or a Python virtual environment. The LiteRT-LM path must continue to work unchanged for macOS, Linux, and Windows + WSL2 users.

## Background

The Electron renderer communicates with the inference backend via IPC channels (`sidecar:send`, `sidecar:chunk`, `sidecar:done`, etc.). These channels are implemented in `sidecarBridge.ts`, which currently delegates exclusively to `wsClient.ts` (the LiteRT WebSocket client). The bridge layer is the only place that needs to change — the renderer and IPC channel names are unaffected.

```
Current (LiteRT only):
  Renderer ──IPC──▶ sidecarBridge.ts ──WebSocket──▶ Python FastAPI (LiteRT-LM)

After (hybrid):
  Renderer ──IPC──▶ sidecarBridge.ts ─┬─ WebSocket ──▶ Python FastAPI (LiteRT-LM)  [macOS/Linux/WSL2]
                                       └─ REST/SSE  ──▶ llamafile server             [Windows no WSL2]
```

The llamafile server is already downloadable and startable via `npm run setup:llamafile` / `npm run dev:llamafile`. The missing piece is the Electron-side client that talks to it and feeds its output into the existing IPC pipeline.

---

## Scope

### Track DM0 — llamafile client

New file: `src/main/sidecar/llamafileClient.ts`

Exposes the same interface as `wsClient.ts` so `sidecarBridge.ts` can swap between them without knowing the difference:

```ts
// Same shape as wsClient.ts exports
connectToLlamafile(host: string): void
sendToLlamafile(message: WsOutboundMessage | WsInterruptMessage): void
onLlamafileMessage(handler: (message: WsInboundMessage) => void): void
onLlamafileStatus(handler: (status: SidecarStatus) => void): void
getLlamafileStatus(): SidecarStatus
disconnectFromLlamafile(): void
```

#### Protocol translation

| LiteRT WebSocket message | llamafile REST equivalent |
|---|---|
| `sendToSidecar({text, image, preset_id})` | `POST /v1/chat/completions` — messages array with system prompt from preset, user text, optional vision content |
| `{type: "token", text}` | SSE `data:` line → `choices[0].delta.content` |
| `{type: "done"}` | SSE `data: [DONE]` |
| `{type: "error", message}` | HTTP error status or SSE error chunk |
| `{type: "interrupt"}` | Abort the in-flight `fetch()` via `AbortController` |

Vision content format for llamafile:
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Summarise this slide." },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
  ]
}
```

#### Conversation history (stateless REST)

LiteRT-LM is stateful: it maintains a KV cache per WebSocket connection, so only the new turn is sent each time. llamafile is stateless: the full conversation history must be sent in every request.

`llamafileClient.ts` maintains a `messages: {role, content}[]` array in memory, scoped to the current session:
- On `SESSION_START` (or the first send after connect): reset history to `[]`
- On each `sendToLlamafile()`: append the user turn, POST the full history, append the completed assistant response after `[DONE]`
- On `SESSION_STOP`: clear history

The session lifecycle hooks are provided by `sidecarBridge.ts` calling into the client.

#### System prompt injection

The LiteRT sidecar selects system prompts by `preset_id` server-side. llamafile has no concept of presets. `llamafileClient.ts` reads `preset_id` from the outbound message and resolves it to a system prompt string using the same registry used by the Python sidecar (`sidecar/prompts/presets.py`). A TypeScript copy of the preset strings lives at `src/main/sidecar/presets.ts`.

### Track DM1 — backend selector in sidecarBridge

Modify `src/main/ipc/sidecarBridge.ts` to read `INFERENCE_BACKEND` from env at startup and wire up either `wsClient` or `llamafileClient`:

```ts
const backend = process.env.INFERENCE_BACKEND ?? 'litert'  // 'litert' | 'llamafile'
```

No other logic in `sidecarBridge.ts` changes — the two clients present identical interfaces.

Pass `backend` config through `RegisterIpcHandlersOptions` from `src/main/index.ts`.

### Track DM2 — health check

`src/main/sidecar/healthCheck.ts` is currently a placeholder. Implement polling for both backends:

| Backend | Health endpoint | Ready signal |
|---|---|---|
| LiteRT | `GET http://localhost:8321/health` → `{"status": "ok"}` | `model_loaded: true` |
| llamafile | `GET http://localhost:8080/health` → `{"status": "ok"}` | HTTP 200 |

### Track DM3 — TTS on the llamafile path

TTS is currently handled by the Python sidecar (kokoro-onnx), which only exists on the LiteRT path. On the llamafile path, no server-side TTS is available yet. Two candidates:

#### Candidate A: Piper TTS (pre-built binary)
- Pre-built binaries for Windows x64, macOS arm64/x64, Linux x64
- Electron main spawns `piper` CLI: pipe text in, get raw PCM back
- ~20 MB binary + ~60 MB voice model
- Good quality for English; fewer voice options than Kokoro

#### Candidate B: Frozen kokoro-onnx sidecar (PyInstaller)
- Freeze the existing `sidecar/tts.py` pipeline into a standalone binary per platform
- Electron main spawns it; it exposes `POST /tts` → streamed audio
- ~250 MB frozen binary; same voice quality as current
- Requires per-platform PyInstaller CI builds; espeak-ng path must be resolved

**For MVP:** the llamafile path falls back to Web Speech (browser TTS) with no `audio_*` events emitted from the bridge. DM3 is deferred until after DM0–DM2 are stable.

---

## Out of scope

- Changes to the renderer or Zustand stores
- Changes to the existing Python sidecar (it remains for `npm run dev:full` / `npm run dev:sidecar`)
- VAD pipeline changes
- Electron packaging (handled in `distribution-packaging-spec.md`)
- GPU inference (handled in `distribution-packaging-spec.md` stretch goal)

---

## New files

| File | Purpose |
|---|---|
| `src/main/sidecar/llamafileClient.ts` | REST/SSE client for llamafile; manages conversation history; same interface as `wsClient.ts` |
| `src/main/sidecar/presets.ts` | TypeScript copy of the Python preset registry for system prompt injection |

## Modified files

| File | Change |
|---|---|
| `src/main/ipc/sidecarBridge.ts` | Read `INFERENCE_BACKEND` env var; delegate to `wsClient` or `llamafileClient` |
| `src/main/sidecar/healthCheck.ts` | Implement polling for both backends |
| `src/shared/types.ts` | Add `InferenceBackend = 'litert' \| 'llamafile'` and `LlamafileClientConfig` types |
| `src/main/ipc/types.ts` | Add `backend` field to `RegisterIpcHandlersOptions` |
| `src/main/index.ts` | Read `INFERENCE_BACKEND` from env; pass to `registerSidecarBridge` |
| `.env.example` | Add `INFERENCE_BACKEND=litert` with comment explaining when to switch |

---

## Interface contract

### New env var

| Variable | Default | Purpose |
|---|---|---|
| `INFERENCE_BACKEND` | `litert` | Which backend to use: `litert` or `llamafile` |

The llamafile connection details reuse the existing `LLAMAFILE_PORT` / `LLAMAFILE_BIN` vars added for `scripts/run-llamafile.mjs`.

### New shared types (`src/shared/types.ts`)

```ts
export type InferenceBackend = 'litert' | 'llamafile';

export type LlamafileClientConfig = {
  host: string;   // e.g. 'localhost:8080'
};
```

No new renderer-facing IPC channels. The existing `sidecar:*` channels are preserved.

---

## Acceptance criteria

- [ ] `INFERENCE_BACKEND=llamafile npm run dev` starts the Electron app; a text prompt completes end-to-end on native Windows with `npm run dev:llamafile` running
- [ ] Vision prompt (screenshot attached) produces a valid response via llamafile
- [ ] Multi-turn conversation works: each follow-up turn receives context from prior turns
- [ ] `interrupt` (stop button) cancels in-progress generation within 500 ms
- [ ] `INFERENCE_BACKEND=litert npm run dev:full` (default) still works unchanged on macOS / Linux / WSL2
- [ ] Status indicator in the renderer correctly reflects connected / disconnected for both backends
- [ ] Web Speech TTS fallback fires on the llamafile path (no `audio_*` events emitted)

---

## Risks / open questions

1. **Gemma 4 vision via llamafile**: confirm that `bartowski/google_gemma-4-E2B-it-IQ4_NL.gguf` supports multimodal input. The vision projector (`mmproj-*.gguf`) may need to be downloaded separately and passed via `--mmproj` flag. `scripts/setup-llamafile.mjs` will need to download it.
2. **Slot cancellation**: llamafile inherits llama.cpp's slot API. Aborting the `fetch()` via `AbortController` should stop the response stream, but verify the server actually halts generation (not just stops sending tokens).
3. **Context window overflow for multi-turn**: the llamafile path sends full history each request. Long sessions will exceed the 8192-token context window. The client must trim old turns when approaching the limit.
4. **Preset strings staying in sync**: `src/main/sidecar/presets.ts` duplicates the Python preset strings. If prompts are updated in `sidecar/prompts/`, the TypeScript copy must be updated too. Consider a single JSON source of truth shared between both.
