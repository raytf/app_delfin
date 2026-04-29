"""Turn feature data transfer objects."""

from __future__ import annotations

from dataclasses import dataclass

from sidecar.app.turn.domain.enums.socket_message_type import TurnOutboundSocketEvent


@dataclass
class TurnRequestDto:
    """Normalized inbound turn request payload."""

    session_id: str
    text: str | None
    image_base64: str | None
    audio_base64: str | None


@dataclass
class TurnStreamEventDto:
    """Normalized outbound turn stream event."""

    type: TurnOutboundSocketEvent
    data: object | None = None
    audio: str | None = None
    sample_rate: int | None = None
    sentence_count: int | None = None
    index: int | None = None
    text: str | None = None
    tts_time: float | None = None
    message: str | None = None
