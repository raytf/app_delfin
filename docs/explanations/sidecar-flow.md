# Sidecar — How the Inference Backend Works

## The Big Picture

The inference backend is the **LiteRT-LM C++ bridge** (primary on all platforms). Electron talks to it exclusively over a **WebSocket** (`ws://localhost:8321/ws`) via the Node.js proxy.

```
Electron → WebSocket → litert-cpp-proxy.mjs → delfin_litert_bridge (C++)
                                             ↘ piper (TTS subprocess)
                                             ↘ litert-cpp-presets.mjs (system prompts)
```

> **Deprecated path:** The Python FastAPI sidecar (`sidecar/server.py`) speaks the same WebSocket protocol and is retained for developer reference. It is not used in packaged builds. See the end of this document for a brief description.

---

## The Layers (LiteRT-LM C++ Bridge)

### 1. `native/litert-cpp-bridge/` — The C++ Inference Engine

The `delfin_litert_bridge` binary is a C++ process that owns model execution. It:

- Loads the Gemma 4 `.litertlm` model on startup; emits `{"type":"ready","backend":"...","model":"..."}` when ready
- Maintains **per-session KV-cache** — the proxy sends a stable `sessionId` UUID with every request so multi-turn conversation context is preserved without re-loading the model
- Accepts **multimodal content** — a `message` with `content` entries of type `image` (base64 blob), `audio` (base64 blob), and/or `text`
- Streams one `{"type":"token","requestId":"...","text":"..."}` line per generated token
- Finishes with `{"type":"done","requestId":"..."}` or `{"type":"error","requestId":"...","message":"..."}`
- Responds to `{"type":"interrupt","requestId":"..."}` mid-stream and `{"type":"reset_session","sessionId":"..."}` to free KV-cache

All communication is **JSONL over stdin/stdout** (readline-framed).

---

### 2. `scripts/litert-cpp-presets.mjs` — System Prompt Registry

Maps `preset_id` strings (`"lecture-slide"`, `"generic-screen"`) to full system prompt text. The proxy resolves the preset before forwarding the request to the bridge.

---

### 3. `scripts/litert-cpp-proxy.mjs` — The Coordinator

This is the main process. It exposes a WebSocket server on `127.0.0.1:8321` and owns three responsibilities:

#### a) WebSocket server

Per connected client the proxy maintains:

```javascript
session = {
  sessionId: randomUUID(),      // stable across turns; sent to bridge for KV-cache
  activeRequestId: null,        // one inflight request at a time
  activeTtsRun: null,           // one TTS stream at a time
}
```

Incoming messages are routed:

- `{"type":"interrupt"}` → cancels active TTS run + sends interrupt to bridge
- Everything else → normal inference request

#### b) STDIO bridge to `delfin_litert_bridge`

`bridge.generate(request, handlers)` writes a JSONL request to the bridge's stdin:

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

Each `token` line from stdout fires `onToken(text)`, which:
- Sends `{"type":"token","text":"..."}` to Electron over WebSocket
- Feeds accumulated text to the TTS pipeline sentence by sentence

When the bridge emits `done`, the proxy flushes remaining TTS, waits for audio to finish, then sends `{"type":"done"}` to Electron.

#### c) Piper TTS pipeline

When `LITERT_CPP_TTS_BACKEND=piper`, the proxy:

1. Splits streamed tokens into sentences on `.!?` boundaries; soft-flushes at `LITERT_CPP_TTS_SOFT_MAX_CHARS` for long text without punctuation
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

## Why the Proxy Exists — and the Bridge-Minimal Principle

The C++ bridge is a thin inference kernel. It knows nothing about WebSockets, TTS, application presets, or the Delfin protocol — and that is intentional. Building the bridge requires Bazel + the full LiteRT-LM dependency tree, which is slow. Keeping it minimal means rebuilds are rare: only when a new LiteRT-LM API call, hardware backend, or content modality is actually needed.

**Bridge JSONL contract (stable):**

| Direction | Message types |
|-----------|---------------|
| In | `generate`, `interrupt`, `reset_session` |
| Out | `ready`, `token`, `done`, `error` |

The `done` event carries only `{"type":"done","requestId":"..."}` — no text echo. The proxy accumulates `streamedText` from token events and uses that for everything downstream.

**Everything else lives in the proxy.** A new Delfin feature belongs in `litert-cpp-proxy.mjs` by default:

- WebSocket server + HTTP health endpoint
- Preset resolution (`litert-cpp-presets.mjs`)
- Message assembly (packing image / audio / text into the bridge's JSONL format)
- TTS (Piper subprocess, PCM streaming, sentence splitting, `audio_start/chunk/end` protocol)
- Per-connection session state and one-request-per-session enforcement
- Bridge subprocess lifecycle (spawn, ready timeout, library path injection, graceful shutdown)
- Future: conversation history trimming, Markdown stripping, latency tracking, memory extraction

---

## Deprecated: Python FastAPI Sidecar

> `sidecar/server.py` is **deprecated** and not used in packaged builds.

The Python sidecar speaks the same WebSocket protocol but uses the LiteRT-LM Python API instead of the C++ bridge. It has the same turn lifecycle:

- `receiver()` coroutine owns the socket; routes interrupts and normal messages via an `asyncio.Queue`
- `handle_turn()` assembles multimodal content, streams tokens, optionally emits `audio_start` / `audio_chunk*` / `audio_end` (via Kokoro ONNX or MLX), then `done`
- Never crashes — all exceptions return `{"type":"error","message":"..."}`

For developer reference, see `sidecar/server.py` and `sidecar/tts.py`. The message ordering and WebSocket contract are identical to the C++ proxy path.
