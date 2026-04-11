"""Text-to-speech pipeline with graceful fallback behavior."""

from __future__ import annotations

import logging
import os
import re

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_KOKORO_VOICE = "af_heart"
DEFAULT_KOKORO_SPEED = 1.0


def split_sentences(text: str) -> list[str]:
    """Split model output into speakable sentence-sized chunks."""
    collapsed = " ".join(text.split())
    if not collapsed:
        return []

    sentences = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", collapsed)]
    return [sentence for sentence in sentences if sentence]


class TTSPipeline:
    """Server-side TTS pipeline.

    Backends:
    - kokoro: real server-side synthesis
    - web-speech / mlx / unknown: renderer fallback (no server audio)
    """

    def __init__(self) -> None:
        requested_backend = os.environ.get("TTS_BACKEND", "web-speech").strip().lower()
        self.backend = "none"
        self.sample_rate = 24_000
        self.model = None

        if requested_backend == "kokoro":
            model_path = os.environ.get("KOKORO_MODEL_PATH", "kokoro-v1.0.onnx")
            voices_path = os.environ.get("KOKORO_VOICES_PATH", "voices-v1.0.bin")

            try:
                from kokoro_onnx import Kokoro

                self.model = Kokoro(model_path=model_path, voices_path=voices_path)
                self.backend = "kokoro"
                logger.info(
                    "TTSPipeline initialised with Kokoro (model=%s, voices=%s).",
                    model_path,
                    voices_path,
                )
            except Exception as exc:
                logger.warning(
                    "Kokoro initialisation failed (%s). Falling back to renderer TTS.",
                    exc,
                )
        elif requested_backend == "mlx":
            logger.warning(
                "TTS_BACKEND=mlx requested, but mlx-audio is not implemented yet. "
                "Falling back to renderer TTS.",
            )
        elif requested_backend in {"web-speech", "none", ""}:
            logger.info(
                "TTSPipeline disabled on the sidecar (backend=%s). Renderer fallback expected.",
                requested_backend or "none",
            )
        else:
            logger.warning(
                "Unknown TTS_BACKEND=%s. Falling back to renderer TTS.",
                requested_backend,
            )

    def is_available(self) -> bool:
        return self.backend == "kokoro" and self.model is not None

    def generate(self, text: str) -> np.ndarray:
        """Generate signed 16-bit PCM mono audio for a sentence."""
        sentence = " ".join(text.split())
        if not sentence or not self.is_available():
            return np.array([], dtype=np.int16)

        samples, sample_rate = self.model.create(
            sentence,
            voice=DEFAULT_KOKORO_VOICE,
            speed=DEFAULT_KOKORO_SPEED,
        )
        self.sample_rate = sample_rate

        clipped = np.clip(samples, -1.0, 1.0)
        return (clipped * 32767).astype(np.int16)
