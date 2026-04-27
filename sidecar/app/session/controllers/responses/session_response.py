"""Response model for session payloads."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionResponse(BaseModel):
    """Serialized session response model."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    started_at: datetime
    ended_at: datetime | None
    status: str
    message_count: int
    updated_at: datetime
