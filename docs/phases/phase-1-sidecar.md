# Phase 1 — Inference Sidecar

> **Goal**: Build the Python FastAPI sidecar with LiteRT-LM inference, tool calling for structured output, image preprocessing, and interrupt handling. At the end of this phase, you can send a base64 image + question via WebSocket and receive a structured response.

**Depends on**: Phase 0 (sidecar directory, requirements.txt, .env.example)

---

## 1.1 Engine loading with GPU try/fallback

### sidecar/inference/engine.py

Build the LiteRT-LM engine loader:

1. Read `MODEL_REPO`, `MODEL_FILE`, `LITERT_BACKEND`, and `LITERT_CACHE_DIR` from environment
2. Download the model using `huggingface_hub.hf_hub_download(MODEL_REPO, MODEL_FILE)` — this caches locally after first download
3. Create the engine with `litert_lm.Engine(path, backend=..., cache_dir=...)`
4. If `LITERT_BACKEND=GPU`, attempt GPU first. If it raises an exception, log the error and fall back to CPU
5. Return both the engine instance and the active backend name (string: `"CPU"` or `"GPU"`)

Key details:
- Use the engine as a context manager (`__enter__` / `__exit__`)
- Set `vision_backend` to the same backend as the main backend
- Set `audio_backend` to `CPU` always (audio acceleration is not needed)
- The engine load happens in `lifespan()` via `asyncio.loop.run_in_executor` so it doesn't block the event loop

### Pre-warm

After the engine loads, send a single throwaway text-only prompt (e.g., `"hello"`) to initialise caches. This eliminates cold-start latency on the first real request. Do this inside the lifespan startup, after the engine is ready.

## 1.2 Image preprocessing

### sidecar/inference/preprocess.py

A single function: `resize_image_blob(b64_str: str) -> str`

1. Read `MAX_IMAGE_WIDTH` from environment (default: 512)
2. Decode the base64 string to bytes
3. Open with PIL
4. If width exceeds max, resize proportionally using `Image.LANCZOS`
5. Re-encode as JPEG (quality=85) and return base64 string
6. All in-memory — no temp files, no disk I/O

## 1.3 System prompts

### sidecar/prompts/lecture_slide.py

```python
SYSTEM_PROMPT = """You are a lecture slide assistant. The user will show you a screenshot of a lecture slide and ask questions about it.

Rules:
- Only describe what is visible on the slide. Never invent content.
- Use the respond_to_user tool for all responses.
- Keep the summary under 2 sentences.
- Key points should be 2-4 bullet items.
- Explain jargon in simple terms.
- If asked to quiz, generate 2-3 questions based on visible content."""
```

Keep this under 200 tokens. Every token is a fixed cost on every request.

### sidecar/prompts/generic_screen.py

Same structure, adapted for generic screen content. Also under 200 tokens.

### sidecar/prompts/presets.py

A dictionary mapping preset IDs to system prompts:

```python
from .lecture_slide import SYSTEM_PROMPT as LECTURE_PROMPT
from .generic_screen import SYSTEM_PROMPT as GENERIC_PROMPT

PRESETS = {
    "lecture-slide": LECTURE_PROMPT,
    "generic-screen": GENERIC_PROMPT,
}
```

## 1.4 FastAPI WebSocket server

### sidecar/server.py

Build the full FastAPI application:

#### Lifespan

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, active_backend, tts_pipeline
    loop = asyncio.get_event_loop()
    engine, active_backend = await loop.run_in_executor(None, load_engine)
    # Pre-warm: send throwaway prompt
    await loop.run_in_executor(None, pre_warm, engine)
    # TTS init (optional, based on TTS_ENABLED)
    if os.environ.get("TTS_ENABLED", "false").lower() == "true":
        tts_pipeline = TTSPipeline()
    yield
    engine.__exit__(None, None, None)
```

#### Health endpoint

```python
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": engine is not None,
        "backend": active_backend,
        "model": os.environ.get("MODEL_FILE", "unknown"),
        "vision_tokens": os.environ.get("VISION_TOKEN_BUDGET", "280"),
    }
```

#### WebSocket endpoint

Use a **single-consumer** pattern with `asyncio.Queue` — validated by the [Parlor reference implementation](https://github.com/fikrikarim/parlor). This avoids the race condition that occurs when two coroutines both try to consume from the same WebSocket's `iter_text()` generator simultaneously.

```python
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    interrupted = asyncio.Event()
    preset_id = "lecture-slide"  # default, updated per message

    # Per-connection tool result captured via closure (not a global)
    tool_result: dict = {}

    def respond_to_user(summary: str, answer: str, key_points: list[str]) -> str:
        """Respond to the user with a structured analysis of the screen content."""
        tool_result["summary"] = summary
        tool_result["answer"] = answer
        tool_result["key_points"] = key_points
        return "OK"

    conversation = engine.create_conversation(
        messages=[{"role": "system", "content": PRESETS[preset_id]}],
        tools=[respond_to_user],
    )
    conversation.__enter__()

    msg_queue: asyncio.Queue = asyncio.Queue()

    async def receiver():
        """Single WebSocket consumer. Routes interrupt messages to the event;
        all other messages go on the queue. Sends None as a sentinel on disconnect."""
        try:
            while True:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                if msg.get("type") == "interrupt":
                    interrupted.set()
                else:
                    await msg_queue.put(msg)
        except WebSocketDisconnect:
            await msg_queue.put(None)  # sentinel to unblock the main loop

    recv_task = asyncio.create_task(receiver())

    try:
        while True:
            msg = await msg_queue.get()
            if msg is None:
                break
            interrupted.clear()
            await handle_turn(ws, conversation, msg, interrupted, tool_result)
    finally:
        recv_task.cancel()
        conversation.__exit__(None, None, None)
```

#### Tool calling

`respond_to_user` is defined **inside** `ws_endpoint` as a closure over the per-connection `tool_result` dict (see above). This is the same pattern used by Parlor. Do **not** define `tool_result` as a module-level global — that would cause data races between concurrent WebSocket connections.

#### Handle turn

```python
async def handle_turn(ws, conversation, msg, interrupted, tool_result):
    tool_result.clear()

    content = []
    if msg.get("image"):
        blob = resize_image_blob(msg["image"])
        content.append({"type": "image", "blob": blob})
    content.append({"type": "text", "text": msg.get("text", "")})

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: conversation.send_message({"role": "user", "content": content})
        )

        if tool_result:
            # Primary path: model called the tool correctly
            await ws.send_json({"type": "structured", "data": dict(tool_result)})
        else:
            # Fallback 1: try to extract structure from raw text using regex
            raw_text = (
                result.get("content", [{}])[0].get("text", "")
                if isinstance(result, dict)
                else str(result)
            )
            extracted = _extract_structured_from_text(raw_text)
            if extracted:
                await ws.send_json({"type": "structured", "data": extracted})
            else:
                # Fallback 2: emit as a plain text token
                await ws.send_json({"type": "token", "text": raw_text})

        await ws.send_json({"type": "done"})

    except Exception as e:
        await ws.send_json({"type": "error", "message": str(e)})
```

#### JSON extraction helper (Fallback 1)

Add this module-level helper for when the model emits free text instead of calling the tool:

```python
import re as _re

def _extract_structured_from_text(text: str) -> dict | None:
    """Try to extract structured fields from raw model output when tool calling fails.

    Looks for patterns like 'Summary: ...', 'Answer: ...', 'Key points: - ...'
    Returns a dict with summary/answer/key_points if any fields are found, else None.
    """
    result: dict = {}

    summary_match = _re.search(
        r'(?:Summary|Overview)[:\s]+(.+?)(?:\n|$)', text, _re.IGNORECASE
    )
    if summary_match:
        result["summary"] = summary_match.group(1).strip()

    answer_match = _re.search(
        r'(?:Answer|Response)[:\s]+(.+?)(?:\n\n|\Z)', text, _re.IGNORECASE | _re.DOTALL
    )
    if answer_match:
        result["answer"] = answer_match.group(1).strip()

    kp_match = _re.search(
        r'(?:Key [Pp]oints?|Points?|Bullets?)[:\s]+((?:[-*•]\s*.+\n?)+)',
        text, _re.IGNORECASE
    )
    if kp_match:
        lines = kp_match.group(1).strip().split('\n')
        result["key_points"] = [
            _re.sub(r'^[-*•]\s*', '', l).strip() for l in lines if l.strip()
        ]

    return result if result else None
```

**Note on the LiteRT-LM API**: Image blobs (`{"type": "image", "blob": b64_str}`) are confirmed valid by the Parlor reference implementation, which uses the same LiteRT-LM + Gemma 4 E2B stack. No temp files needed. Consult the LiteRT-LM Python API documentation at `https://ai.google.dev/edge/litert-lm/python` for any other API details. The key requirements are:
- One conversation per WebSocket connection (created as a context manager)
- Tool defined as a closure per connection, not a module-level function
- Base64 image blobs passed directly (confirmed valid; no temp files)
- Interrupt support via `asyncio.Event` checked in the receiver, not in a second `iter_text()` loop

## 1.5 Conversation history management *(nice-to-have)*

The conversation object maintains history automatically. For a hackathon session this is usually fine, but long-running sessions may slow down as context grows.

If time allows, implement a parallel Python list that tracks sent messages, and use it to reconstruct the conversation when trimming:

```python
# Track history independently — don't rely on LiteRT-LM exposing get_messages()
sent_messages: list[dict] = [{"role": "system", "content": system_prompt}]
MAX_HISTORY_TURNS = 5  # keep last 5 user/assistant pairs

# After each handle_turn call:
sent_messages.append({"role": "user", "content": content})
sent_messages.append({"role": "assistant", "content": tool_result or raw_text})

if len(sent_messages) > MAX_HISTORY_TURNS * 2 + 1:
    trimmed = [sent_messages[0]] + sent_messages[-(MAX_HISTORY_TURNS * 2):]
    conversation.__exit__(None, None, None)
    conversation = engine.create_conversation(
        messages=trimmed, tools=[respond_to_user]
    )
    conversation.__enter__()
    sent_messages = trimmed
```

This approach avoids depending on a `get_messages()` API that may not exist in LiteRT-LM. Skip this entirely if you're short on time — the performance impact only shows after 10+ turns.

## 1.6 TTS placeholder

### sidecar/tts.py

For this phase, create a placeholder `TTSPipeline` class that:
- Initialises based on `TTS_BACKEND` environment variable
- Has a `generate(text: str) -> np.ndarray` method that returns an empty array
- Logs a message saying TTS is not implemented yet

The real TTS implementation comes in Phase 5.

---

## ✅ Phase 1 — Verification Checklist

- [ ] `cd sidecar && uvicorn server:app --host 0.0.0.0 --port 8321` starts successfully
- [ ] `curl http://localhost:8321/health` returns `{"status": "ok", "model_loaded": true, ...}` (assuming model is downloaded)
- [ ] Connect via `wscat -c ws://localhost:8321/ws`
- [ ] Send `{"text": "What is 2+2?", "preset_id": "lecture-slide"}` — receive token or structured messages followed by `{"type": "done"}`
- [ ] Send a message with a `"image"` field containing a valid base64 JPEG — receive a structured response describing the image
- [ ] Send `{"type": "interrupt"}` while a response is streaming — streaming stops
- [ ] Send 10+ messages in sequence — responses continue without significant slowdown (history trimming works)
- [ ] If `LITERT_BACKEND=GPU` is set on an Apple Silicon Mac, the health endpoint reports `"backend": "GPU"` (or gracefully falls back to CPU)
- [ ] No temp files are created during image processing (check /tmp)
- [ ] Errors in inference return `{"type": "error", "message": "..."}` instead of crashing the server
