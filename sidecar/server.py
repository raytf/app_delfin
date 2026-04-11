"""FastAPI sidecar — LiteRT-LM inference over WebSocket."""

import asyncio
import json
import logging
import os
import re as _re
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from inference.engine import load_engine, pre_warm
from inference.preprocess import resize_image_blob
from prompts.presets import PRESETS
from tts import TTSPipeline

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Module-level singletons — set during lifespan startup
engine: Any = None
active_backend: str = "CPU"
tts_pipeline: TTSPipeline | None = None


# ---------------------------------------------------------------------------
# Token cleanup — strip Gemma 4 internal quote artifacts from tool results
# ---------------------------------------------------------------------------

_QUOTE_TOKEN_RE = _re.compile(r'<\|"\|>')


def _clean(value: str) -> str:
    """Strip Gemma 4 internal quote tokens (e.g. <|"|>) from a string."""
    return _QUOTE_TOKEN_RE.sub('', value).strip()


def _clean_tool_result(result: dict) -> dict:
    """Recursively clean Gemma 4 quote tokens from a tool result dict."""
    cleaned: dict = {}
    for k, v in result.items():
        if isinstance(v, str):
            cleaned[k] = _clean(v)
        elif isinstance(v, list):
            cleaned[k] = [_clean(item) if isinstance(item, str) else item for item in v]
        else:
            cleaned[k] = v
    return cleaned


# ---------------------------------------------------------------------------
# Structured-text extraction fallback
# ---------------------------------------------------------------------------

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
        r'(?:Key [Pp]oints?|Points?|Bullets?)[:\s]+((?:[-*\u2022]\s*.+\n?)+)',
        text, _re.IGNORECASE
    )
    if kp_match:
        lines = kp_match.group(1).strip().split('\n')
        result["key_points"] = [
            _re.sub(r'^[-*\u2022]\s*', '', line).strip()
            for line in lines if line.strip()
        ]

    return result if result else None


# ---------------------------------------------------------------------------
# Handle a single inference turn
# ---------------------------------------------------------------------------

async def handle_turn(
    ws: WebSocket,
    conversation: Any,
    msg: dict,
    tool_result: dict,
) -> None:
    tool_result.clear()

    content: list[dict] = []
    if msg.get("image"):
        blob = resize_image_blob(msg["image"])
        content.append({"type": "image", "blob": blob})
    content.append({"type": "text", "text": msg.get("text", "")})

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: conversation.send_message({"role": "user", "content": content}),
        )

        if tool_result:
            # Primary path: model called the respond_to_user tool
            await ws.send_json({"type": "structured", "data": _clean_tool_result(dict(tool_result))})
        else:
            # Fallback 1: try to extract structure from raw text
            raw_text: str = ""
            if isinstance(result, dict):
                items = result.get("content", [])
                raw_text = items[0].get("text", "") if items else ""
            else:
                raw_text = str(result)

            extracted = _extract_structured_from_text(raw_text)
            if extracted:
                await ws.send_json({"type": "structured", "data": extracted})
            else:
                # Fallback 2: plain token
                await ws.send_json({"type": "token", "text": raw_text})

        await ws.send_json({"type": "done"})

    except Exception as exc:
        logger.exception("Inference error: %s", exc)
        await ws.send_json({"type": "error", "message": str(exc)})


# ---------------------------------------------------------------------------
# Lifespan: load engine + pre-warm on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001
    global engine, active_backend, tts_pipeline
    loop = asyncio.get_event_loop()
    engine, active_backend = await loop.run_in_executor(None, load_engine)
    await loop.run_in_executor(None, pre_warm, engine)
    if os.environ.get("TTS_ENABLED", "false").lower() == "true":
        tts_pipeline = TTSPipeline()
    yield
    if engine is not None:
        engine.__exit__(None, None, None)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": engine is not None,
        "backend": active_backend,
        "model": os.environ.get("MODEL_FILE", "unknown"),
        "vision_tokens": os.environ.get("VISION_TOKEN_BUDGET", "280"),
    }


# ---------------------------------------------------------------------------
# WebSocket endpoint — single-consumer pattern
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    interrupted = asyncio.Event()

    # Per-connection tool result via closure — avoids global data races
    tool_result: dict = {}

    def respond_to_user(summary: str, answer: str, key_points: list[str]) -> str:
        """Respond to the user with a structured analysis of the screen content."""
        tool_result["summary"] = summary
        tool_result["answer"] = answer
        tool_result["key_points"] = key_points
        return "OK"

    preset_id = "lecture-slide"
    system_prompt = PRESETS[preset_id]

    conversation = engine.create_conversation(
        messages=[{"role": "system", "content": [{"type": "text", "text": system_prompt}]}],
        tools=[respond_to_user],
    )
    conversation.__enter__()

    msg_queue: asyncio.Queue = asyncio.Queue()

    async def receiver() -> None:
        """Single WebSocket consumer.

        Routes interrupt messages to the event; all other messages go on the
        queue. Sends None as a sentinel on disconnect.
        """
        try:
            while True:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                if msg.get("type") == "interrupt":
                    interrupted.set()
                else:
                    # Update preset for this connection if supplied
                    nonlocal preset_id, system_prompt
                    if "preset_id" in msg and msg["preset_id"] in PRESETS:
                        preset_id = msg["preset_id"]
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
            await handle_turn(ws, conversation, msg, tool_result)
    finally:
        recv_task.cancel()
        conversation.__exit__(None, None, None)

