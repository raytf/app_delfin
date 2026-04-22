"""FastAPI sidecar — LiteRT-LM inference over WebSocket."""

import asyncio
import base64
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager, suppress
from typing import Any

from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from inference.engine import load_engine, pre_warm
from inference.preprocess import resize_image_blob
from prompts.presets import PRESETS
from tts import TTSPipeline, split_sentences

load_dotenv(find_dotenv())
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Module-level singletons — set during lifespan startup
engine: Any = None
active_backend: str = "CPU"
tts_pipeline: TTSPipeline | None = None


# ---------------------------------------------------------------------------
# Handle a single inference turn
# ---------------------------------------------------------------------------

async def handle_turn(
    ws: WebSocket,
    conversation: Any,
    msg: dict,
    interrupted: asyncio.Event,
) -> None:
    """Stream tokens from the model directly to the WebSocket client."""
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

    tts_sentence_queue: asyncio.Queue[str | None] | None = None
    tts_worker: asyncio.Task[None] | None = None
    turn_t0 = time.monotonic()

    try:
        loop = asyncio.get_running_loop()
        chunk_queue: asyncio.Queue[str | None | Exception] = asyncio.Queue()
        full_text_parts: list[str] = []
        tts_buffer = ""

        if tts_pipeline is not None and tts_pipeline.is_available():
            tts_sentence_queue = asyncio.Queue()
            tts_worker = asyncio.create_task(
                stream_tts_sentence_queue(
                    ws=ws,
                    sentence_queue=tts_sentence_queue,
                    interrupted=interrupted,
                    turn_t0=turn_t0,
                )
            )
            logger.info("[handle_turn] +%.3fs TTS worker created", time.monotonic() - turn_t0)

        def _run_stream() -> None:
            try:
                stream = conversation.send_message_async({"role": "user", "content": content})
                for chunk in stream:
                    if interrupted.is_set():
                        break
                    for item in chunk.get("content", []):
                        if item.get("type") == "text" and item.get("text"):
                            asyncio.run_coroutine_threadsafe(chunk_queue.put(item["text"]), loop)
                asyncio.run_coroutine_threadsafe(chunk_queue.put(None), loop)  # sentinel
            except Exception as exc:
                logger.exception("Stream error: %s", exc)
                asyncio.run_coroutine_threadsafe(chunk_queue.put(exc), loop)

        executor_fut = loop.run_in_executor(None, _run_stream)

        while True:
            if interrupted.is_set():
                logger.info("[handle_turn] +%.3fs interrupted during token loop", time.monotonic() - turn_t0)
                break
            try:
                item = await asyncio.wait_for(chunk_queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            full_text_parts.append(item)
            await ws.send_json({"type": "token", "text": item})

            if tts_sentence_queue is not None:
                tts_buffer += item
                ready_sentences, tts_buffer = drain_complete_tts_sentences(tts_buffer)
                for sentence in ready_sentences:
                    logger.info("[handle_turn] +%.3fs enqueued sentence for TTS: %s", time.monotonic() - turn_t0, sentence[:60])
                    await tts_sentence_queue.put(sentence)

        logger.info("[handle_turn] +%.3fs token loop finished", time.monotonic() - turn_t0)
        await executor_fut
        logger.info("[handle_turn] +%.3fs executor done", time.monotonic() - turn_t0)

        if tts_sentence_queue is not None:
            try:
                final_sentence = normalize_tts_text(tts_buffer)
                if final_sentence and not interrupted.is_set():
                    logger.info("[handle_turn] +%.3fs enqueued final sentence: %s", time.monotonic() - turn_t0, final_sentence[:60])
                    await tts_sentence_queue.put(final_sentence)
                await tts_sentence_queue.put(None)
                if tts_worker is not None:
                    await tts_worker
            except Exception as tts_exc:
                logger.warning(
                    "[handle_turn] TTS error (non-fatal, inference already delivered): %s",
                    tts_exc,
                )

        logger.info("[handle_turn] +%.3fs sending done", time.monotonic() - turn_t0)
        await ws.send_json({"type": "done"})
        logger.info("[handle_turn] done sent")

    except Exception as exc:
        logger.exception("Inference error: %s", exc)
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            logger.exception("[handle_turn] failed to send error message to client")
    finally:
        if tts_worker is not None and not tts_worker.done():
            if tts_sentence_queue is not None:
                with suppress(Exception):
                    await tts_sentence_queue.put(None)
            tts_worker.cancel()
            with suppress(asyncio.CancelledError):
                await tts_worker


def normalize_tts_text(text: str) -> str:
    """Collapse whitespace for stable incremental sentence detection."""
    return " ".join(text.split())


def drain_complete_tts_sentences(buffer: str) -> tuple[list[str], str]:
    """Return completed sentences and the remaining incomplete tail."""
    collapsed = normalize_tts_text(buffer)
    if not collapsed:
        return [], ""

    sentences = split_sentences(collapsed)
    if not sentences:
        return [], collapsed

    ends_with_sentence_punctuation = bool(re.search(r"[.!?][\"')\]]*$", collapsed))
    if ends_with_sentence_punctuation:
        return sentences, ""

    if len(sentences) == 1:
        return [], sentences[0]

    return sentences[:-1], sentences[-1]


async def stream_tts_sentence_queue(
    ws: WebSocket,
    sentence_queue: asyncio.Queue[str | None],
    interrupted: asyncio.Event,
    turn_t0: float = 0.0,
) -> None:
    """Synthesize and stream sentence-level TTS concurrently with token output."""
    if interrupted.is_set() or tts_pipeline is None or not tts_pipeline.is_available():
        return

    loop = asyncio.get_running_loop()
    audio_started = False
    chunk_index = 0
    tts_start = 0.0

    while True:
        sentence = await sentence_queue.get()
        if sentence is None:
            logger.info("[TTS] +%.3fs received sentinel, stopping", time.monotonic() - turn_t0)
            break
        if interrupted.is_set():
            logger.info("[TTS] +%.3fs interrupted, stopping", time.monotonic() - turn_t0)
            break

        if tts_start == 0.0:
            tts_start = time.monotonic()

        logger.info("[TTS] +%.3fs synthesizing: %s", time.monotonic() - turn_t0, sentence[:60])
        pcm = await loop.run_in_executor(None, tts_pipeline.generate, sentence)
        logger.info("[TTS] +%.3fs synthesis done (%d samples)", time.monotonic() - turn_t0, pcm.size)
        if interrupted.is_set():
            logger.info("[TTS] +%.3fs interrupted after synthesis", time.monotonic() - turn_t0)
            break
        if pcm.size == 0:
            continue

        if not audio_started:
            await ws.send_json({
                "type": "audio_start",
                "sample_rate": tts_pipeline.sample_rate,
            })
            logger.info("[TTS] +%.3fs audio_start sent", time.monotonic() - turn_t0)
            audio_started = True

        audio_b64 = base64.b64encode(pcm.tobytes()).decode("ascii")
        await ws.send_json({"type": "audio_chunk", "audio": audio_b64, "index": chunk_index})
        logger.info("[TTS] +%.3fs audio_chunk[%d] sent", time.monotonic() - turn_t0, chunk_index)
        chunk_index += 1

    if audio_started:
        tts_time = round(time.monotonic() - tts_start, 3)
        await ws.send_json({"type": "audio_end", "tts_time": tts_time})
        logger.info("[TTS] streamed %d chunks in %.3fs", chunk_index, tts_time)


# ---------------------------------------------------------------------------
# Lifespan: load engine + pre-warm on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001
    global engine, active_backend, tts_pipeline
    loop = asyncio.get_running_loop()
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

    preset_id = "lecture-slide"
    system_prompt = PRESETS[preset_id]

    conversation = engine.create_conversation(
        messages=[{"role": "system", "content": [{"type": "text", "text": system_prompt}]}],
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
                    logger.info("[receiver] interrupt received")
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
            await handle_turn(ws, conversation, msg, interrupted)
    finally:
        recv_task.cancel()
        conversation.__exit__(None, None, None)



if __name__ == "__main__":
    import uvicorn

    host = os.getenv("SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("SIDECAR_PORT", "8321"))
    uvicorn.run(app, host=host, port=port)
