"""Session domain service implementation."""

from __future__ import annotations

from sidecar.app.session.domain.aggregates.session_aggregate import SessionAggregate
from sidecar.app.session.domain.abstractions.session_conversation_manager import SessionConversationManager
from sidecar.app.session.domain.abstractions.session_repository import SessionRepository
from sidecar.app.session.domain.abstractions.session_service import SessionService
from sidecar.app.session.domain.dtos.create_session_dto import CreateSessionDto
from sidecar.app.session.domain.dtos.update_session_dto import UpdateSessionDto
from sidecar.app.session.domain.entities.session_entity import SessionEntity
from sidecar.app.session.domain.entities.session_message_entity import SessionMessageEntity
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

    async def get_one_by_id(self, session_id: str) -> SessionAggregate:
        session_entity = await self._session_repository.get_one_by_id(session_id)
        if session_entity is None:
            raise NotFoundException(f"Session not found: {session_id}")
        messages = await self._session_repository.get_session_messages(session_id) 
        return SessionAggregate(session=session_entity, messages=messages)

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

    async def create_session_message(
        self,
        session_id: str,
        message: SessionMessageEntity,
        *,
        image_base64: str | None = None,
        audio_base64: str | None = None,
    ) -> SessionMessageEntity:
        existing_session = await self.get_one_by_id(session_id)
        image_path, audio_path = await self._session_repository.persist_media(
            session_id,
            message.id,
            image_base64=image_base64,
            audio_base64=audio_base64,
        )
        persisted_message = SessionMessageEntity(
            id=message.id,
            session_id=message.session_id,
            author=message.author,
            content=message.content,
            timestamp=message.timestamp,
            image_path=image_path,
            audio_path=audio_path,
            error_message=message.error_message,
            interrupted=message.interrupted,
        )
        await self._session_repository.create_session_message(session_id, persisted_message)
        existing_session.message_count += 1
        existing_session.touch()
        await self._session_repository.update_by_id(session_id, existing_session)
        return persisted_message

    async def replace_message(
        self,
        session_id: str,
        message_id: str,
        message: SessionMessageEntity,
    ) -> SessionMessageEntity:
        existing_session = await self.get_one_by_id(session_id)
        await self._session_repository.replace_session_message(session_id, message_id, message)
        existing_session.touch()
        await self._session_repository.update_by_id(session_id, existing_session)
        return message
