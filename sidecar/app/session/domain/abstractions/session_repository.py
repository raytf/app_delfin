"""Session persistence contracts."""

from __future__ import annotations

from abc import ABC, abstractmethod

from sidecar.app.session.domain.dtos.session_message_dto import SessionMessageDto
from sidecar.app.session.domain.entities.session_entity import SessionEntity


class SessionRepository(ABC):
    """Repository contract for sidecar-owned session persistence."""

    @abstractmethod
    async def create(self, session: SessionEntity) -> SessionEntity:
        """Persist a new session record and return the created entity."""
        raise NotImplementedError

    @abstractmethod
    async def get(self) -> list[SessionEntity]:
        """List persisted sessions."""
        raise NotImplementedError

    @abstractmethod
    async def get_one_by_id(self, session_id: str) -> SessionEntity | None:
        """Fetch a session record by id."""
        raise NotImplementedError

    @abstractmethod
    async def update_by_id(self, session_id: str, session: SessionEntity) -> SessionEntity | None:
        """Update a session record by id."""
        raise NotImplementedError

    @abstractmethod
    async def delete_by_id(self, session_id: str) -> None:
        """Delete a session record by id."""
        raise NotImplementedError

    @abstractmethod
    async def append_message(self, session_id: str, message: SessionMessageDto) -> None:
        """Persist a session message."""
        raise NotImplementedError
