# Phase 1 Sidecar — How the Engine and Server Work Together

## The Big Picture

The sidecar is a **Python FastAPI process** that sits alongside the Electron app. It owns all AI inference. Electron talks to it exclusively over a **WebSocket** (`ws://localhost:8321/ws`).

```
Electron → WebSocket → server.py → engine.py → LiteRT-LM (Gemma 4)
                                 ↘ preprocess.py (resize image)
                                 ↘ prompts/presets.py (system prompt)
```

---

## The Three Layers

### 1. `engine.py` — The Model Loader

Its one job is to **load Gemma 4 into memory** at startup. It:
- Downloads the model file from HuggingFace Hub (cached after first download)
- Tries to create a `litert_lm.Engine` on **GPU** first, falls back to **CPU** if that fails
- Returns both the engine instance and the backend name (`"GPU"` or `"CPU"`)

The engine is a **context manager** (`__enter__`/`__exit__`) — it holds open resources for the lifetime of the app.

> **Currently:** `engine.py` is a placeholder stub that raises `NotImplementedError`. Phase 1 builds the real version.

---

### 2. `server.py` — The Coordinator

This is where everything connects. It has three responsibilities:

#### a) Startup (`lifespan`)
On boot, it:
1. Calls `load_engine()` (from `engine.py`) in a thread executor so it doesn't freeze the async event loop
2. Sends a throwaway `"hello"` prompt to **pre-warm** the model (eliminates cold-start lag on the first real request)
3. Optionally starts the TTS pipeline if `TTS_ENABLED=true`

#### b) Health check (`GET /health`)
A simple HTTP endpoint Electron can poll to know if the model is ready.

#### c) WebSocket turns (`/ws`)
This is the main inference loop. For each connected client:

1. A **single `receiver()` coroutine** reads all incoming messages and puts them on an `asyncio.Queue`
   - If the message is `{"type": "interrupt"}` → sets an event flag to stop streaming
   - Everything else → goes on the queue for normal processing
   - On disconnect → puts `None` (a sentinel) to cleanly break the loop

2. The **main loop** picks messages off the queue and calls `handle_turn()` for each one

3. **`handle_turn()`** does the actual work:
   - Clears the previous tool result
   - If there's an image, runs `resize_image_blob()` from `preprocess.py` first
   - Sends the message to `conversation.send_message()` (runs the LLM in an executor)
   - Checks what came back and sends one of three responses over WebSocket:
     - ✅ Model called the tool correctly → `{"type": "structured", data: {summary, answer, key_points}}`
     - ⚠️ Model ignored the tool but wrote text → regex-extract structure from the raw text
     - ❌ Neither → emit as a plain `{"type": "token"}` stream
   - Always ends with `{"type": "done"}`
   - On any exception → `{"type": "error", "message": "..."}` — **never crashes the server**

---

### 3. The `respond_to_user` Tool — The Structured Output Trick

The LLM is given a Python function called `respond_to_user(summary, answer, key_points)` as a **tool**. When the model calls it, the function saves the values into a `tool_result` dict (a closure scoped per-connection). Then `handle_turn` reads that dict to send a structured JSON response.

This is how you get clean, typed output (`summary`, `answer`, `key_points`) out of a chat model that normally just streams text.

> The tool is defined **inside** `ws_endpoint()` as a closure — not at module level — so concurrent connections never share the same `tool_result` dict.

---

## Why the Single-Consumer Pattern?

Two coroutines cannot both run `async for msg in ws.iter_text()` simultaneously — they race and silently drop messages. The solution is one `receiver()` coroutine that owns the socket, and a `Queue` to pass messages to the main loop.

---

## Current State vs. What Phase 1 Builds

| File | Now | After Phase 1 |
|---|---|---|
| `server.py` | Bare health endpoint, no WebSocket | Full lifespan, `/ws` endpoint, `handle_turn` |
| `inference/engine.py` | Placeholder stub | Real `load_engine()` with GPU/CPU fallback |
| `inference/preprocess.py` | Placeholder stub | `resize_image_blob()` using PIL |
| `prompts/presets.py` | Empty dict | `{"lecture-slide": ..., "generic-screen": ...}` |
| `tts.py` | Placeholder stub | Still a stub (real TTS is Phase 5) |

Phase 1 wires all these pieces together so that `wscat` can send a base64 image + question and get back a structured JSON response from a real local model.
