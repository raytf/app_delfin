"""Session aggregate."""

from __future__ import annotations

from sidecar.app.session.domain.entities.session_entity import SessionEntity
from sidecar.app.session.domain.entities.session_message_entity import SessionMessageEntity


class SessionAggregate(SessionEntity):
    """A session entity with its messages."""

    def __init__(self, session: SessionEntity, messages: list[SessionMessageEntity]) -> None:
        super().__init__(name=session.name, preset_id=session.preset_id)
        self.id = session.id
        self.started_at = session.started_at
        self.ended_at = session.ended_at
        self.status = session.status
        self.message_count = session.message_count
        self.updated_at = session.updated_at
        self.messages = messages
