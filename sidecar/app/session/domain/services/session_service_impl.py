"""Session domain service implementation."""

from __future__ import annotations

from datetime import datetime, timezone

from sidecar.app.session.domain.abstractions.session_repository import SessionRepository
from sidecar.app.session.domain.abstractions.session_service import SessionService
from sidecar.app.session.domain.dtos.create_session_dto import CreateSessionDto
from sidecar.app.session.domain.dtos.update_session_dto import UpdateSessionDto
from sidecar.app.session.domain.entities.session_entity import SessionEntity
from sidecar.shared.exceptions import NotFoundException


class SessionServiceImpl(SessionService):
    """Default session service backed by a session repository."""

    def __init__(self, session_repository: SessionRepository) -> None:
        self._session_repository = session_repository

    async def create(self, sessionDto: CreateSessionDto) -> SessionEntity:
        session_entity = SessionEntity(name=sessionDto.session_name)
        return await self._session_repository.create(session_entity)

    async def get_one_by_id(self, session_id: str) -> SessionEntity:
        session_entity = await self._session_repository.get_one_by_id(session_id)
        if session_entity is None:
            raise NotFoundException(f"Session not found: {session_id}")
        return session_entity

    async def get(self) -> list[SessionEntity]:
        return await self._session_repository.get()

    async def update_by_id(self, session_id: str, updateDto: UpdateSessionDto) -> SessionEntity:
        existing_session = await self.get_one_by_id(session_id)
        if updateDto.session_name is not None:
            existing_session.name = updateDto.session_name

        updated_session = await self._session_repository.update_by_id(session_id, existing_session)
        if updated_session is None:
            raise NotFoundException(f"Session not found: {session_id}")
        return updated_session

    async def end_by_id(self, session_id: str) -> SessionEntity:
        existing_session = await self.get_one_by_id(session_id)
        now = datetime.now(timezone.utc)
        existing_session.ended_at = now
        existing_session.updated_at = now
        existing_session.status = "ended"

        updated_session = await self._session_repository.update_by_id(session_id, existing_session)
        if updated_session is None:
            raise NotFoundException(f"Session not found: {session_id}")
        return updated_session

    async def delete_by_id(self, session_id: str) -> None:
        await self._session_repository.delete_by_id(session_id)
