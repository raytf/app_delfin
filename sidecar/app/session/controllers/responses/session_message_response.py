"""Response model for session message payloads."""

from __future__ import annotations

from pydantic import BaseModel


class SessionMessageResponse(BaseModel):
    """Serialized session message response model."""

    id: str
    session_id: str
    author: str
    content: str
    timestamp: float
    image_path: str | None = None
    audio_path: str | None = None
    error_message: str | None = None
    interrupted: bool = False
