"""File-backed session repository scaffold."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sidecar.app.session.domain.abstractions.session_repository import SessionRepository
from sidecar.app.session.domain.dtos.session_message_dto import SessionMessageDto
from sidecar.app.session.domain.entities.session_entity import SessionEntity


class FileSessionRepository(SessionRepository):
    """File-based session repository backed by JSON files."""

    def __init__(self, storage_root: Path) -> None:
        self._storage_root = storage_root
        self._storage_root.mkdir(parents=True, exist_ok=True)

    async def create(self, session: SessionEntity) -> SessionEntity:
        session_record = self._build_session_record(session=session, messages=[])
        self._write_session_record(session_id=session.id, session_record=session_record)
        return session

    async def get(self) -> list[SessionEntity]:
        sessions: list[SessionEntity] = []

        for session_file in sorted(self._storage_root.glob("*.json")):
            session_record = self._read_session_record(session_file)
            sessions.append(self._map_record_to_entity(session_record))

        return sessions

    async def get_one_by_id(self, session_id: str) -> SessionEntity | None:
        session_file = self._get_session_file_path(session_id)
        if not session_file.exists():
            return None

        session_record = self._read_session_record(session_file)
        return self._map_record_to_entity(session_record)

    async def update_by_id(self, session_id: str, session: SessionEntity) -> SessionEntity | None:
        session_file = self._get_session_file_path(session_id)
        if not session_file.exists():
            return None

        existing_record = self._read_session_record(session_file)
        session_record = self._build_session_record(
            session=session,
            messages=self._get_messages_from_record(existing_record),
        )
        self._write_session_record(session_id=session_id, session_record=session_record)
        return session

    async def delete_by_id(self, session_id: str) -> None:
        session_file = self._get_session_file_path(session_id)
        if session_file.exists():
            session_file.unlink()

    async def append_message(self, session_id: str, message: SessionMessageDto) -> None:
        session_file = self._get_session_file_path(session_id)
        if not session_file.exists():
            raise FileNotFoundError(f"Session not found: {session_id}")

        session_record = self._read_session_record(session_file)
        messages = self._get_messages_from_record(session_record)
        messages.append(self._map_message_to_record(message))
        session_record["messages"] = messages
        self._write_session_record(session_id=session_id, session_record=session_record)

    def _get_session_file_path(self, session_id: str) -> Path:
        return self._storage_root / f"{session_id}.json"

    def _read_session_record(self, session_file: Path) -> dict[str, Any]:
        return json.loads(session_file.read_text(encoding="utf-8"))

    def _write_session_record(self, session_id: str, session_record: dict[str, Any]) -> None:
        session_file = self._get_session_file_path(session_id)
        session_file.write_text(
            json.dumps(session_record, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

    def _build_session_record(self, session: SessionEntity, messages: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "id": session.id,
            "name": session.name,
            "started_at": self._serialize_datetime(session.started_at),
            "ended_at": self._serialize_datetime(session.ended_at),
            "status": session.status,
            "message_count": session.message_count,
            "updated_at": self._serialize_datetime(session.updated_at),
            "messages": messages,
        }

    def _map_record_to_entity(self, session_record: dict[str, Any]) -> SessionEntity:
        session_entity = SessionEntity(name=str(session_record["name"]))
        session_entity.id = str(session_record["id"])
        session_entity.started_at = self._deserialize_datetime(session_record["started_at"])
        session_entity.ended_at = self._deserialize_datetime(session_record["ended_at"])
        session_entity.status = str(session_record["status"])
        session_entity.message_count = int(session_record["message_count"])
        session_entity.updated_at = self._deserialize_datetime(session_record["updated_at"])
        return session_entity

    def _map_message_to_record(self, message: SessionMessageDto) -> dict[str, Any]:
        return {
            "id": message.id,
            "session_id": message.session_id,
            "role": message.role,
            "content": message.content,
            "timestamp": message.timestamp,
            "image_path": message.image_path,
            "is_voice_turn": message.is_voice_turn,
            "error_message": message.error_message,
        }

    def _get_messages_from_record(self, session_record: dict[str, Any]) -> list[dict[str, Any]]:
        raw_messages = session_record.get("messages", [])
        if not isinstance(raw_messages, list):
            return []
        return [message for message in raw_messages if isinstance(message, dict)]

    def _serialize_datetime(self, value: datetime | None) -> float | None:
        if value is None:
            return None
        return value.timestamp()

    def _deserialize_datetime(self, value: Any) -> datetime | None:
        if value is None:
            return None
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
