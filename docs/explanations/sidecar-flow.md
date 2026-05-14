# Sidecar — How the Inference Backend Works

## The Big Picture

The inference backend is the **LiteRT-LM C++ bridge** (primary on all platforms), driven by the **TypeScript sidecar**. Electron talks to the sidecar exclusively over a **WebSocket** (`ws://localhost:8321/ws`).

```
Electron → WebSocket → sidecar/src/ (TypeScript) → delfin_litert_bridge (C++)
                                                  ↘ piper (TTS subprocess)
```

The TypeScript sidecar (`sidecar/src/`) is the application layer; the C++ bridge (`litert-cpp-bridge/` build output) is a thin inference kernel. The sidecar spawns the bridge and Piper as child processes.

> **Deprecated path:** The Python FastAPI sidecar (`sidecar-old/server.py`) speaks the same WebSocket protocol and is retained for developer reference. It is not used in packaged builds. See the end of this document for a brief description.

---

## The Layers

### 1. `litert-cpp-bridge/` — The C++ Inference Engine

The `delfin_litert_bridge` binary is a C++ process that owns model execution. It:

- Loads the Gemma 4 `.litertlm` model on startup; emits `{"type":"ready","backend":"...","model":"..."}` when ready
- Maintains **per-session KV-cache** — the sidecar sends a stable `sessionId` UUID with every request so multi-turn conversation context is preserved without re-loading the model
- Accepts **multimodal content** — a `message` with `content` entries of type `image` (base64 blob), `audio` (base64 blob), and/or `text`
- Streams one `{"type":"token","requestId":"...","text":"..."}` line per generated token
- Finishes with `{"type":"done","requestId":"..."}` or `{"type":"error","requestId":"...","message":"..."}`
- Responds to `{"type":"interrupt","requestId":"..."}` mid-stream and `{"type":"reset_session","sessionId":"..."}` to free KV-cache

All communication is **JSONL over stdin/stdout** (readline-framed). The bridge source is a structured C++ tree — `main.cc`, `app.*`, `protocol/`, `engine/`, `conversation_registry/`, `turn_runner/` — built with Bazel; see `litert-cpp-bridge/README.md`.

---

### 2. `sidecar/src/shared/constants/preset-prompts.ts` — System Prompt Registry

Maps `preset_id` strings (`"lecture-slide"`, `"generic-screen"`) to full system prompt text. The sidecar resolves the preset before forwarding the request to the bridge.

---

### 3. `sidecar/src/` — The TypeScript Sidecar (Coordinator)

This is the application layer. `sidecar/src/index.ts` wires dependencies and starts an Express HTTP + WebSocket server on `127.0.0.1:8321`. It is organised in layers:

#### a) Controllers — HTTP + WebSocket entry points

- `app/turn/controllers/` — the WebSocket turn endpoint (`/ws`). `turn-controller.ts` + `websocket-turn-streamer.ts` accept inference requests, route `{"type":"interrupt"}` to cancel the active turn, and stream results back.
- `app/session/controllers/` — the REST `/sessions` endpoints for conversation lifecycle (create, list, update).
- `shared/middleware/` — request validation and HTTP exception handling.

#### b) Domain services — turn + session logic

- `app/turn/domain/services/turn-service-impl.ts` — owns one inference turn: resolves the preset, assembles the multimodal message, streams tokens, and drives the TTS pipeline sentence by sentence.
- `app/session/domain/services/session-service-impl.ts` — conversation lifecycle; persistence via `repositories/file-session-repository.ts`.

#### c) External engine adapters

- `external/inference-engine/litert-cpp-inference-engine.ts` — spawns and owns the `delfin_litert_bridge` subprocess; writes JSONL requests to its stdin and parses `ready` / `token` / `done` / `error` events from stdout. Manages spawn, ready-timeout, library-path injection, and graceful shutdown.
- `external/tts/piper-tts-engine.ts` — spawns the `piper` CLI subprocess; feeds it sentence text and reads raw PCM.

A `generate` request written to the bridge looks like:

```json
{
  "type": "generate",
  "requestId": "uuid",
  "sessionId": "uuid",
  "systemPrompt": "You are a helpful...",
  "message": {
    "role": "user",
    "content": [
      { "type": "image", "blob": "<base64 JPEG>" },
      { "type": "text", "text": "Explain this slide" }
    ]
  }
}
```

Each `token` line from the bridge is sent to Electron as `{"type":"token","text":"..."}` and also fed to the TTS pipeline. When the bridge emits `done`, the sidecar flushes remaining TTS, waits for audio to finish, then sends `{"type":"done"}` to Electron.

#### d) Piper TTS pipeline

When `TTS_BACKEND=piper`, the sidecar:

1. Splits streamed tokens into sentences on `.!?` boundaries; soft-flushes at `TTS_SOFT_MAX_CHARS` for long text without punctuation
2. Feeds each sentence to the `piper` CLI subprocess as stdin text; reads raw PCM audio from stdout
3. Streams audio chunks back to Electron as `audio_start` → `audio_chunk*` → `audio_end` **before** the final `done`

This means `done` is always the authoritative end-of-turn, delivered only after all audio has been sent.

---

## Message Ordering

For a turn with Piper TTS:

```
token* → audio_start → audio_chunk* → audio_end → done
```

Without TTS (or when Piper is disabled/absent):

```
token* → done
```

The renderer falls back to Web Speech after `done` when no `audio_start` has arrived.

---

## Why the Sidecar Exists — and the Bridge-Minimal Principle

The C++ bridge is a thin inference kernel. It knows nothing about WebSockets, TTS, application presets, or the Delfin protocol — and that is intentional. Building the bridge requires Bazel + the full LiteRT-LM dependency tree, which is slow. Keeping it minimal means rebuilds are rare: only when a new LiteRT-LM API call, hardware backend, or content modality is actually needed.

**Bridge JSONL contract (stable):**

| Direction | Message types |
|-----------|---------------|
| In | `generate`, `interrupt`, `reset_session` |
| Out | `ready`, `token`, `done`, `error` |

The `done` event carries only `{"type":"done","requestId":"..."}` — no text echo. The sidecar accumulates `streamedText` from token events and uses that for everything downstream.

**Everything else lives in the TypeScript sidecar.** A new Delfin feature belongs in `sidecar/src/` by default:

- WebSocket server + HTTP health endpoint + REST session endpoints
- Preset resolution (`shared/constants/preset-prompts.ts`)
- Message assembly (packing image / audio / text into the bridge's JSONL format)
- TTS (Piper subprocess, PCM streaming, sentence splitting, `audio_start/chunk/end` protocol)
- Per-connection turn state, interrupt handling, and cancellation
- Bridge subprocess lifecycle (spawn, ready timeout, library path injection, graceful shutdown)
- Future: conversation history trimming, Markdown stripping, latency tracking, memory extraction

---

## Deprecated: Python FastAPI Sidecar

> `sidecar-old/server.py` is **deprecated** and not used in packaged builds.

The Python sidecar speaks the same WebSocket protocol but uses the LiteRT-LM Python API instead of the C++ bridge. It has the same turn lifecycle:

- `receiver()` coroutine owns the socket; routes interrupts and normal messages via an `asyncio.Queue`
- `handle_turn()` assembles multimodal content, streams tokens, optionally emits `audio_start` / `audio_chunk*` / `audio_end` (via Kokoro ONNX or MLX), then `done`
- Never crashes — all exceptions return `{"type":"error","message":"..."}`

For developer reference, see `sidecar-old/server.py` and `sidecar-old/tts.py`. The message ordering and WebSocket contract are identical to the TypeScript sidecar path.
