"""TTS pipeline placeholder — real implementation in Phase 5."""

import logging
import os

import numpy as np

logger = logging.getLogger(__name__)


class TTSPipeline:
    """Placeholder TTS pipeline. Returns empty audio arrays until Phase 5."""

    def __init__(self) -> None:
        backend = os.environ.get("TTS_BACKEND", "web-speech")
        logger.info("TTSPipeline init (backend=%s) — not yet implemented.", backend)
        self.backend = backend

    def generate(self, text: str) -> np.ndarray:
        """Return an empty float32 array — TTS not implemented until Phase 5."""
        logger.info("TTS.generate() called (no-op until Phase 5).")
        return np.array([], dtype=np.float32)
