"""Turn feature data transfer objects."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TurnRequestDto:
    """Normalized inbound turn request payload."""

    text: str | None
    image_base64: str | None
    audio_base64: str | None
    preset_id: str


@dataclass
class TurnStreamEventDto:
    """Normalized outbound turn stream event."""

    type: str
    text: str | None = None
    message: str | None = None
