"""Sentence-level TTS streaming helpers."""

from __future__ import annotations

import asyncio
import base64
import logging
import re
import time

from fastapi import WebSocket

from sidecar.tts.interfaces import TTSProvider
from sidecar.tts.pipeline import split_sentences

logger = logging.getLogger(__name__)


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
    tts_provider: TTSProvider | None,
    turn_t0: float = 0.0,
) -> None:
    """Synthesize and stream sentence-level TTS concurrently with token output."""
    if interrupted.is_set() or tts_provider is None or not tts_provider.is_available():
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
            await ws.send_json(
                {
                    "type": "audio_start",
                    "sample_rate": tts_provider.sample_rate,
                }
            )
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
