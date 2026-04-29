"""Turn feature service implementation."""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from contextlib import suppress

from sidecar.app.session.domain.abstractions.session_conversation_manager import SessionConversationManager
from sidecar.app.turn.domain.abstractions.turn_service import TurnService
from sidecar.app.turn.domain.abstractions.turn_streamer import TurnStreamer
from sidecar.app.turn.domain.dtos.turn_dtos import TurnRequestDto
from sidecar.application.services.tts_stream_service import (
    drain_complete_tts_sentences,
    normalize_tts_text,
)
from sidecar.inference.preprocess import resize_image_blob
from sidecar.tts.interfaces import TTSProvider

logger = logging.getLogger(__name__)


class TurnServiceImpl(TurnService):
    """Coordinates multimodal inference turns and optional TTS streaming."""

    def __init__(
        self,
        session_conversation_manager: SessionConversationManager,
        tts_provider: TTSProvider | None = None,
    ) -> None:
        self._session_conversation_manager = session_conversation_manager
        self._tts_provider = tts_provider

    async def handle_turn(
        self,
        turn_request: TurnRequestDto,
        streamer: TurnStreamer,
        interrupted: asyncio.Event,
    ) -> None:
        """Stream tokens from the model directly through the streamer."""
        conversation = await self._session_conversation_manager.get(turn_request.session_id)
        content = self._build_content(turn_request)
        if not content:
            await streamer.send_error("Request must include text, image, or audio.")
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
                    self._stream_tts_sentence_queue(
                        streamer=streamer,
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

                await streamer.send_token(item)

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
            await streamer.send_done()
            logger.info("[handle_turn] done sent")

        except Exception as exc:
            logger.exception("Inference error: %s", exc)
            try:
                await streamer.send_error(str(exc))
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

    def _build_content(self, turn_request: TurnRequestDto) -> list[dict[str, str]]:
        content: list[dict[str, str]] = []
        if turn_request.image_base64:
            blob = resize_image_blob(turn_request.image_base64)
            content.append({"type": "image", "blob": blob})

        if turn_request.audio_base64:
            content.append({"type": "audio", "blob": turn_request.audio_base64})

        if isinstance(turn_request.text, str) and turn_request.text.strip():
            content.append({"type": "text", "text": turn_request.text})

        return content

    async def _stream_tts_sentence_queue(
        self,
        streamer: TurnStreamer,
        sentence_queue: asyncio.Queue[str | None],
        interrupted: asyncio.Event,
        tts_provider: TTSProvider,
        turn_t0: float = 0.0,
    ) -> None:
        """Synthesize and stream sentence-level TTS concurrently with token output."""
        if interrupted.is_set() or not tts_provider.is_available():
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
            pcm = await loop.run_in_executor(None, tts_provider.generate, sentence)
            logger.info("[TTS] +%.3fs synthesis done (%d samples)", time.monotonic() - turn_t0, pcm.size)
            if interrupted.is_set():
                logger.info("[TTS] +%.3fs interrupted after synthesis", time.monotonic() - turn_t0)
                break
            if pcm.size == 0:
                continue

            if not audio_started:
                await streamer.send_audio_start(
                    sample_rate=tts_provider.sample_rate,
                    sentence_count=0,
                )
                logger.info("[TTS] +%.3fs audio_start sent", time.monotonic() - turn_t0)
                audio_started = True

            audio_b64 = base64.b64encode(pcm.tobytes()).decode("ascii")
            await streamer.send_audio_chunk(audio=audio_b64, index=chunk_index)
            logger.info("[TTS] +%.3fs audio_chunk[%d] sent", time.monotonic() - turn_t0, chunk_index)
            chunk_index += 1

        if audio_started:
            tts_time = round(time.monotonic() - tts_start, 3)
            await streamer.send_audio_end(tts_time=tts_time)
            logger.info("[TTS] streamed %d chunks in %.3fs", chunk_index, tts_time)
