"""Turn orchestration for sidecar inference requests."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import suppress
from typing import Any

from fastapi import WebSocket

from sidecar.application.services.tts_stream_service import (
    drain_complete_tts_sentences,
    normalize_tts_text,
    stream_tts_sentence_queue,
)
from sidecar.inference.preprocess import resize_image_blob
from sidecar.tts.interfaces import TTSProvider

logger = logging.getLogger(__name__)


class TurnService:
    """Coordinates multimodal inference turns and optional TTS streaming."""

    def __init__(self, tts_provider: TTSProvider | None = None) -> None:
        self._tts_provider = tts_provider

    async def handle_turn(
        self,
        ws: WebSocket,
        conversation: Any,
        msg: dict[str, Any],
        interrupted: asyncio.Event,
    ) -> None:
        """Stream tokens from the model directly to the WebSocket client."""
        content: list[dict[str, str]] = []
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
            await ws.send_json(
                {
                    "type": "error",
                    "message": "Request must include text, image, or audio.",
                }
            )
            return

        tts_sentence_queue: asyncio.Queue[str | None] | None = None
        tts_worker: asyncio.Task[None] | None = None
        turn_t0 = time.monotonic()

        try:
            loop = asyncio.get_running_loop()
            chunk_queue: asyncio.Queue[str | None | Exception] = asyncio.Queue()
            tts_buffer = ""

            if self._tts_provider is not None and self._tts_provider.is_available():
                tts_sentence_queue = asyncio.Queue()
                tts_worker = asyncio.create_task(
                    stream_tts_sentence_queue(
                        ws=ws,
                        sentence_queue=tts_sentence_queue,
                        interrupted=interrupted,
                        tts_provider=self._tts_provider,
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
                    asyncio.run_coroutine_threadsafe(chunk_queue.put(None), loop)
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

                await ws.send_json({"type": "token", "text": item})

                if tts_sentence_queue is not None:
                    tts_buffer += item
                    ready_sentences, tts_buffer = drain_complete_tts_sentences(tts_buffer)
                    for sentence in ready_sentences:
                        logger.info(
                            "[handle_turn] +%.3fs enqueued sentence for TTS: %s",
                            time.monotonic() - turn_t0,
                            sentence[:60],
                        )
                        await tts_sentence_queue.put(sentence)

            logger.info("[handle_turn] +%.3fs token loop finished", time.monotonic() - turn_t0)
            await executor_fut
            logger.info("[handle_turn] +%.3fs executor done", time.monotonic() - turn_t0)

            if tts_sentence_queue is not None:
                try:
                    final_sentence = normalize_tts_text(tts_buffer)
                    if final_sentence and not interrupted.is_set():
                        logger.info(
                            "[handle_turn] +%.3fs enqueued final sentence: %s",
                            time.monotonic() - turn_t0,
                            final_sentence[:60],
                        )
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
