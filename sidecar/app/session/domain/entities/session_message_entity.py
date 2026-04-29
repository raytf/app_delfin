"""Session message domain entity."""

from __future__ import annotations


class SessionMessageEntity:
    """Represents a persisted session message."""

    def __init__(
        self,
        *,
        id: str,
        session_id: str,
        author: str,
        content: str,
        timestamp: float,
        image_path: str | None = None,
        audio_path: str | None = None,
        error_message: str | None = None,
        interrupted: bool = False,
    ) -> None:
        self.id = id
        self.session_id = session_id
        self.author = author
        self.content = content
        self.timestamp = timestamp
        self.image_path = image_path
        self.audio_path = audio_path
        self.error_message = error_message
        self.interrupted = interrupted
