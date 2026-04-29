"""Turn WebSocket event types."""

from __future__ import annotations

from enum import StrEnum


class TurnInboundSocketEvent(StrEnum):
    """Inbound WebSocket event types for turn traffic."""

    INTERRUPT = "interrupt"


class TurnOutboundSocketEvent(StrEnum):
    """Outbound WebSocket event types for turn traffic."""

    TOKEN = "token"
    STRUCTURED = "structured"
    AUDIO_START = "audio_start"
    AUDIO_CHUNK = "audio_chunk"
    AUDIO_END = "audio_end"
    DONE = "done"
    ERROR = "error"
