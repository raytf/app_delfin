"""DTO for session messages."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SessionMessageDto:
    """Represents one message within a persisted session."""

    id: str
    session_id: str
    role: str
    content: str
    timestamp: float
    image_path: str | None = None
    is_voice_turn: bool | None = None
    error_message: str | None = None
