"""Session domain service implementation."""

from __future__ import annotations

from sidecar.app.session.domain.abstractions.session_conversation_manager import SessionConversationManager
from sidecar.app.session.domain.abstractions.session_repository import SessionRepository
from sidecar.app.session.domain.abstractions.session_service import SessionService
from sidecar.app.session.domain.dtos.create_session_dto import CreateSessionDto
from sidecar.app.session.domain.dtos.update_session_dto import UpdateSessionDto
from sidecar.app.session.domain.entities.session_entity import SessionEntity
from sidecar.shared.exceptions import NotFoundException


class SessionServiceImpl(SessionService):
    """Default session service backed by a session repository."""

    def __init__(
        self,
        session_repository: SessionRepository,
        session_conversation_manager: SessionConversationManager,
    ) -> None:
        self._session_repository = session_repository
        self._session_conversation_manager = session_conversation_manager

    async def create(self, sessionDto: CreateSessionDto) -> SessionEntity:
        session_entity = SessionEntity(
            name=sessionDto.session_name,
            preset_id=sessionDto.preset_id,
        )
        created_session = await self._session_repository.create(session_entity)
        try:
            await self._session_conversation_manager.create(
                session_id=created_session.id,
                preset_id=created_session.preset_id,
            )
        except Exception:
            await self._session_repository.delete_by_id(created_session.id)
            raise
        return created_session

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
        existing_session.end()

        updated_session = await self._session_repository.update_by_id(session_id, existing_session)
        if updated_session is None:
            raise NotFoundException(f"Session not found: {session_id}")
        await self._session_conversation_manager.close(session_id)
        return updated_session

    async def delete_by_id(self, session_id: str) -> None:
        await self._session_repository.delete_by_id(session_id)
