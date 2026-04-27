"""Session service contracts."""

from __future__ import annotations

from abc import ABC, abstractmethod
from sidecar.app.session.domain.dtos.create_session_dto import CreateSessionDto
from sidecar.app.session.domain.dtos.update_session_dto import UpdateSessionDto
from sidecar.app.session.domain.entities.session_entity import SessionEntity


class SessionService(ABC):
    """Service contract for session operations."""

    @abstractmethod
    async def create(self, sessionDto: CreateSessionDto) -> SessionEntity:
        """Create a session."""
        raise NotImplementedError

    @abstractmethod
    async def get_one_by_id(self, session_id: str) -> SessionEntity:
        """Get a session by id."""
        raise NotImplementedError

    @abstractmethod
    async def get(self) -> list[SessionEntity]:
        """List sessions."""
        raise NotImplementedError

    @abstractmethod
    async def update_by_id(self, session_id: str, updateDto: UpdateSessionDto) -> SessionEntity:
        """Update a session by id."""
        raise NotImplementedError

    @abstractmethod
    async def end_by_id(self, session_id: str) -> SessionEntity:
        """End a session by id."""
        raise NotImplementedError

    @abstractmethod
    async def delete_by_id(self, session_id: str) -> None:
        """Delete a session by id."""
        raise NotImplementedError
