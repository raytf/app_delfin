"""Session domain entity."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone


class SessionEntity:
    """Represents the session domain entity."""

    def __init__(self, name: str) -> None:
        now = datetime.now(timezone.utc)

        self.id = str(uuid.uuid4())
        self.name = name
        self.started_at = now
        self.ended_at = None
        self.status = "active"
        self.message_count = 0
        self.updated_at = now
