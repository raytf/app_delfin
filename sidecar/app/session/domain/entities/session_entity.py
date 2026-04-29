"""Session domain entity."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone


class SessionEntity:
    """Represents the session domain entity."""

    def __init__(self, name: str, preset_id: str) -> None:
        now = datetime.now(timezone.utc)

        self.id = str(uuid.uuid4())
        self.name = name
        self.preset_id = preset_id
        self.started_at = now
        self.ended_at = None
        self.status = "active"
        self.message_count = 0
        self.updated_at = now

    def end(self, status: str = "completed") -> None:
        """Mark the session as ended."""
        now = datetime.now(timezone.utc)
        self.ended_at = now
        self.updated_at = now
        self.status = status

    def touch(self) -> None:
        """Refresh the session updated timestamp."""
        self.updated_at = datetime.now(timezone.utc)
