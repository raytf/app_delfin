"""Session persistence contracts."""

from __future__ import annotations

from abc import ABC, abstractmethod

from sidecar.app.session.domain.entities.session_entity import SessionEntity
from sidecar.app.session.domain.entities.session_message_entity import SessionMessageEntity


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
    async def create_session_message(self, session_id: str, message: SessionMessageEntity) -> None:
        """Persist a session message."""
        raise NotImplementedError

    @abstractmethod
    async def replace_session_message(
        self,
        session_id: str,
        message_id: str,
        message: SessionMessageEntity,
    ) -> None:
        """Replace an existing persisted session message."""
        raise NotImplementedError

    @abstractmethod
    async def get_session_messages(self, session_id: str) -> list[SessionMessageEntity]:
        """Return persisted messages for a session."""
        raise NotImplementedError

    @abstractmethod
    async def persist_media(
        self,
        session_id: str,
        message_id: str,
        *,
        image_base64: str | None = None,
        audio_base64: str | None = None,
    ) -> tuple[str | None, str | None]:
        """Persist optional image/audio blobs and return saved file paths."""
        raise NotImplementedError
