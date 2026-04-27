"""TTS interfaces."""

from __future__ import annotations

from typing import Protocol

import numpy as np


class TTSProvider(Protocol):
    """Interface for server-side TTS providers."""

    @property
    def sample_rate(self) -> int: ...

    def is_available(self) -> bool: ...

    def generate(self, text: str) -> np.ndarray: ...
