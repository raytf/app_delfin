"""FastAPI sidecar — LiteRT-LM inference over WebSocket."""

import asyncio
import json
import logging
import os
import re as _re
from contextlib import asynccontextmanager
from typing import Any

from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from inference.engine import load_engine, pre_warm
from inference.preprocess import resize_image_blob
from prompts.presets import PRESETS
from tts import TTSPipeline

load_dotenv(find_dotenv())
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
            # Clean each item and drop any that become empty after cleaning —
            # guards against the model emitting bare index tokens like "[0]"
            # or <|"|> pairs that collapse to empty strings.
            cleaned_items: list = []
            for item in v:
                if isinstance(item, str):
                    c = _clean(item)
                    if c:  # drop empty strings
                        cleaned_items.append(c)
                else:
                    cleaned_items.append(item)
            cleaned[k] = cleaned_items
        else:
            cleaned[k] = v
    return cleaned


# ---------------------------------------------------------------------------
# Structured-text extraction fallback
# ---------------------------------------------------------------------------

def _extract_structured_from_text(text: str) -> dict | None:
    """Try to extract structured fields from raw model output when tool calling fails.

    Looks for patterns like 'Summary: ...', 'Answer: ...', 'Key points: - ...',
    'Hints: - ...', 'Follow-up questions: - ...'
    Returns a dict with any fields found, else None.
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

    def _extract_bullet_list(pattern: str) -> list[str] | None:
        match = _re.search(pattern, text, _re.IGNORECASE)
        if not match:
            return None
        lines = match.group(1).strip().split('\n')
        return [
            _re.sub(r'^[-*\u2022]\s*', '', line).strip()
            for line in lines if line.strip()
        ]

    kp = _extract_bullet_list(r'(?:Key [Pp]oints?|Points?|Bullets?)[:\s]+((?:[-*\u2022]\s*.+\n?)+)')
    if kp:
        result["key_points"] = kp

    hints = _extract_bullet_list(r'(?:Hints?)[:\s]+((?:[-*\u2022]\s*.+\n?)+)')
    if hints:
        result["hints"] = hints

    fuq = _extract_bullet_list(
        r'(?:Follow[- ]up [Qq]uestions?|Socratic [Qq]uestions?)[:\s]+((?:[-*\u2022]\s*.+\n?)+)'
    )
    if fuq:
        result["follow_up_questions"] = fuq

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

    if msg.get("audio"):
        blob = msg["audio"]
        content.append({"type": "audio", "blob": blob})

    text = msg.get("text")
    if isinstance(text, str) and text.strip():
        content.append({"type": "text", "text": text})

    if not content:
        await ws.send_json({"type": "error", "message": "Request must include text, image, or audio."})
        return

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: conversation.send_message({"role": "user", "content": content}),
        )

        logger.info("[handle_turn] tool_result populated: %s, keys: %s",
                    bool(tool_result), list(tool_result.keys()) if tool_result else [])

        if tool_result:
            # Primary path: model called the respond_to_user tool
            payload = _clean_tool_result(dict(tool_result))
            logger.info("[handle_turn] sending structured response (summary length=%d, kp count=%d)",
                        len(payload.get("summary", "")), len(payload.get("key_points", [])))
            await ws.send_json({"type": "structured", "data": payload})
        else:
            # Fallback 1: try to extract structure from raw text
            raw_text: str = ""
            if isinstance(result, dict):
                items = result.get("content", [])
                raw_text = items[0].get("text", "") if items else ""
            else:
                raw_text = str(result)

            logger.info("[handle_turn] no tool_result; raw_text length=%d, snippet=%r",
                        len(raw_text), raw_text[:120])

            extracted = _extract_structured_from_text(raw_text)
            if extracted:
                logger.info("[handle_turn] fallback: sending extracted structured")
                await ws.send_json({"type": "structured", "data": extracted})
            else:
                # Fallback 2: plain token
                logger.info("[handle_turn] fallback: sending raw token")
                await ws.send_json({"type": "token", "text": raw_text})

        await ws.send_json({"type": "done"})
        logger.info("[handle_turn] done sent")

    except Exception as exc:
        logger.exception("Inference error: %s", exc)
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            logger.exception("[handle_turn] failed to send error message to client")


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

    def respond_to_user(
        summary: str,
        answer: str,
        key_points: list[str],
        hints: list[str],
        follow_up_questions: list[str],
    ) -> str:
        """Respond to the user with a structured analysis of the slide.

        Rules for ALL list fields (key_points, hints, follow_up_questions):
        - Each element must be a plain string with NO prefix notation.
        - Never start an element with [0], [1], [n], or any bracket-index.
        - Use an empty list [] when the field is not applicable.

        hints: plain-text hints from most general to most specific.
        follow_up_questions: 1-2 plain-text follow-up questions.
        """
        # Normalise scalar fields — model may emit None or unexpected types.
        # _clean() is intentionally NOT called here; _clean_tool_result() in
        # handle_turn is the single place responsible for stripping Gemma 4
        # quote tokens, avoiding a double-clean.
        tool_result["summary"] = str(summary) if summary is not None else ""
        tool_result["answer"] = str(answer) if answer is not None else ""

        # Normalise list fields — Gemma 4 sometimes emits a plain newline-
        # delimited string instead of a JSON array.  Python does NOT enforce
        # type annotations at call-time so we guard explicitly.
        # Again, no _clean() here — _clean_tool_result() handles that pass.
        def _to_str_list(value: object) -> list[str]:
            if isinstance(value, list):
                # Filter None AND empty/whitespace-only strings — the model
                # sometimes emits ["", "real content"] when it applies bracket-
                # index notation ([0], [1]…) to list fields.
                return [s for item in value
                        if item is not None and (s := str(item).strip())]
            if isinstance(value, str) and value.strip():
                lines = [
                    _re.sub(r'^[-*\u2022]\s*', '', line).strip()
                    for line in _re.split(r'\n|;', value)
                    if line.strip()
                ]
                return lines if lines else [value.strip()]
            return []

        tool_result["key_points"] = _to_str_list(key_points)
        tool_result["hints"] = _to_str_list(hints)
        tool_result["follow_up_questions"] = _to_str_list(follow_up_questions)
        logger.info(
            "[respond_to_user] summary=%d chars, answer=%d chars, "
            "key_points=%d, hints=%d, fup=%d",
            len(tool_result["summary"]),
            len(tool_result["answer"]),
            len(tool_result["key_points"]),
            len(tool_result["hints"]),
            len(tool_result["follow_up_questions"]),
        )
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

