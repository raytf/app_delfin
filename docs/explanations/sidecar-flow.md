# Sidecar — How the Engine and Server Work Together

## The Big Picture

The sidecar is a **Python FastAPI process** that sits alongside the Electron app. It owns all AI inference. Electron talks to it exclusively over a **WebSocket** (`ws://localhost:8321/ws`).

```
Electron → WebSocket → server.py → engine.py → LiteRT-LM (Gemma 4)
                                 ↘ preprocess.py (resize image)
                                 ↘ prompts/presets.py (system prompt)
                                 ↘ tts.py          (sentence-level TTS)
```

---

## The Layers

### 1. `inference/engine.py` — The Model Loader

Its one job is to **load Gemma 4 into memory** at startup. It:
- Downloads the model file from Hugging Face Hub (cached after first download)
- Tries to create a `litert_lm.Engine` on **GPU** first (when `LITERT_BACKEND=GPU`), falls back to **CPU** if that fails
- Pins `audio_backend=litert_lm.Backend.CPU` in both the GPU and CPU paths — GPU audio is not supported
- Returns both the engine instance and the backend name (`"GPU"` or `"CPU"`)

The engine is a **context manager** (`__enter__`/`__exit__`) — it holds open resources for the lifetime of the app.

`pre_warm(engine)` sends a throwaway `"hello"` prompt through a short-lived conversation so the first real request doesn't pay the cold-start cost.

---

### 2. `inference/preprocess.py` — Image Resizing

`resize_image_blob(b64_str)` decodes the base64 image, resizes it with PIL to at most `MAX_IMAGE_WIDTH` pixels wide (LANCZOS), re-encodes it as JPEG (quality 85) in memory, and returns a new base64 string. No temp files, no disk I/O.

Keeping the image small caps the vision-token cost each turn pays against the model's context budget.

---

### 3. `server.py` — The Coordinator

This is where everything connects. It has three responsibilities:

#### a) Startup (`lifespan`)
On boot, it:
1. Calls `load_engine()` in a thread executor so it doesn't block the async event loop
2. Runs `pre_warm(engine)` to eliminate cold-start lag on the first real request
3. Constructs a `TTSPipeline` if `TTS_ENABLED=true` (the pipeline itself decides between Kokoro ONNX, MLX on Apple Silicon, or a renderer fallback)

#### b) Health check (`GET /health`)
A small HTTP endpoint Electron can poll to see `model_loaded`, the active backend, the model file name, and the vision-token budget.

#### c) WebSocket turns (`/ws`)
This is the main inference loop. For each connected client:

1. A **single `receiver()` coroutine** reads all incoming messages and routes them:
   - `{"type": "interrupt"}` → sets an `asyncio.Event` that the token loop and the TTS worker both check
   - A message carrying a recognised `preset_id` → updates the per-connection preset
   - Everything else → goes on an `asyncio.Queue` for normal processing
   - On disconnect → puts `None` (a sentinel) to cleanly break the loop

2. The **main loop** pulls messages off the queue and calls `handle_turn()` for each one.

3. **`handle_turn()`** assembles the multimodal content list and streams the result:
   - If the message carries an `image`, runs `resize_image_blob()` first and adds an `{"type": "image", "blob": ...}` entry
   - If it carries an `audio` blob (pure voice turn), adds an `{"type": "audio", "blob": ...}` entry
   - If it carries non-empty `text`, adds an `{"type": "text", "text": ...}` entry
   - Calls `conversation.send_message_async({"role": "user", "content": content})` inside a thread executor
   - Streams each text chunk back as `{"type": "token", "text": ...}` as soon as it arrives
   - While tokens accumulate, complete sentences are drained from a buffer and enqueued for the TTS worker (when TTS is available)
   - After the stream ends, the TTS worker emits `audio_start` → `audio_chunk*` → `audio_end` for any sentences it synthesised
   - Always finishes with `{"type": "done"}` — which is therefore the end of **the whole turn**, not just the text stream
   - On any exception → `{"type": "error", "message": "..."}` — **never crashes the server**

---

## Why the Single-Consumer Pattern?

Two coroutines cannot both run `async for msg in ws.iter_text()` simultaneously — they race and silently drop messages. The solution is one `receiver()` coroutine that owns the socket, and a `Queue` to pass messages to the main loop.

---

## Message Ordering

For a turn with server-side TTS, the messages arrive in this order:

```
token* → audio_start → audio_chunk* → audio_end → done
```

When TTS is disabled (or the pipeline is unavailable), the audio messages are skipped entirely:

```
token* → done
```

The renderer treats `done` as the authoritative end-of-turn and falls back to Web Speech when no `audio_start` arrived within a short window after `done`.
