"""Streaming output contracts for the turn feature."""

from __future__ import annotations

from abc import ABC, abstractmethod


class TurnStreamer(ABC):
    """Output contract for emitting turn events to a delivery mechanism."""

    @abstractmethod
    async def send_token(self, text: str) -> None:
        """Emit a token chunk."""
        raise NotImplementedError

    @abstractmethod
    async def send_structured(self, data: object) -> None:
        """Emit a structured response payload."""
        raise NotImplementedError

    @abstractmethod
    async def send_audio_start(self, sample_rate: int, sentence_count: int) -> None:
        """Emit audio stream metadata."""
        raise NotImplementedError

    @abstractmethod
    async def send_audio_chunk(self, audio: str, index: int | None = None) -> None:
        """Emit an audio chunk."""
        raise NotImplementedError

    @abstractmethod
    async def send_audio_end(self, tts_time: float) -> None:
        """Emit the end of audio streaming."""
        raise NotImplementedError

    @abstractmethod
    async def send_done(self) -> None:
        """Emit turn completion."""
        raise NotImplementedError

    @abstractmethod
    async def send_error(self, message: str) -> None:
        """Emit a terminal turn error."""
        raise NotImplementedError
