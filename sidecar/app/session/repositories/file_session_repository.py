"""File-backed session repository scaffold."""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sidecar.app.session.domain.abstractions.session_repository import SessionRepository
from sidecar.app.session.domain.entities.session_entity import SessionEntity
from sidecar.app.session.domain.entities.session_message_entity import SessionMessageEntity


class FileSessionRepository(SessionRepository):
    """File-based session repository backed by JSON files."""

    def __init__(self, storage_root: Path) -> None:
        self._storage_root = storage_root
        self._media_root = self._storage_root / "_media"
        self._storage_root.mkdir(parents=True, exist_ok=True)
        self._media_root.mkdir(parents=True, exist_ok=True)

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
        media_dir = self._get_media_dir_path(session_id)
        if media_dir.exists():
            for media_file in media_dir.iterdir():
                if media_file.is_file():
                    media_file.unlink()
            media_dir.rmdir()

    async def create_session_message(self, session_id: str, message: SessionMessageEntity) -> None:
        session_file = self._get_session_file_path(session_id)
        if not session_file.exists():
            raise FileNotFoundError(f"Session not found: {session_id}")

        session_record = self._read_session_record(session_file)
        messages = self._get_messages_from_record(session_record)
        messages.append(self._map_message_to_record(message))
        session_record["messages"] = messages
        self._write_session_record(session_id=session_id, session_record=session_record)

    async def replace_session_message(
        self,
        session_id: str,
        message_id: str,
        message: SessionMessageEntity,
    ) -> None:
        session_file = self._get_session_file_path(session_id)
        if not session_file.exists():
            raise FileNotFoundError(f"Session not found: {session_id}")

        session_record = self._read_session_record(session_file)
        messages = self._get_messages_from_record(session_record)
        for index, existing in enumerate(messages):
            if str(existing.get("id")) == message_id:
                messages[index] = self._map_message_to_record(message)
                session_record["messages"] = messages
                self._write_session_record(session_id=session_id, session_record=session_record)
                return
        raise FileNotFoundError(f"Session message not found: {message_id}")

    async def get_session_messages(self, session_id: str) -> list[SessionMessageEntity]:
        session_file = self._get_session_file_path(session_id)
        if not session_file.exists():
            raise FileNotFoundError(f"Session not found: {session_id}")

        session_record = self._read_session_record(session_file)
        return [self._map_record_to_message(message) for message in self._get_messages_from_record(session_record)]

    async def persist_media(
        self,
        session_id: str,
        message_id: str,
        *,
        image_base64: str | None = None,
        audio_base64: str | None = None,
    ) -> tuple[str | None, str | None]:
        media_dir = self._get_media_dir_path(session_id)
        media_dir.mkdir(parents=True, exist_ok=True)

        image_path: str | None = None
        audio_path: str | None = None

        if image_base64 is not None:
            image_file = media_dir / f"{message_id}.jpg"
            image_file.write_bytes(base64.b64decode(image_base64))
            image_path = str(image_file.resolve())

        if audio_base64 is not None:
            audio_file = media_dir / f"{message_id}.wav"
            audio_file.write_bytes(base64.b64decode(audio_base64))
            audio_path = str(audio_file.resolve())

        return image_path, audio_path

    def _get_session_file_path(self, session_id: str) -> Path:
        return self._storage_root / f"{session_id}.json"

    def _get_media_dir_path(self, session_id: str) -> Path:
        return self._media_root / session_id

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
            "preset_id": session.preset_id,
            "started_at": self._serialize_datetime(session.started_at),
            "ended_at": self._serialize_datetime(session.ended_at),
            "status": session.status,
            "message_count": session.message_count,
            "updated_at": self._serialize_datetime(session.updated_at),
            "messages": messages,
        }

    def _map_record_to_entity(self, session_record: dict[str, Any]) -> SessionEntity:
        session_entity = SessionEntity(
            name=str(session_record["name"]),
            preset_id=str(session_record.get("preset_id", "lecture-slide")),
        )
        session_entity.id = str(session_record["id"])
        session_entity.started_at = self._deserialize_datetime(session_record["started_at"])
        session_entity.ended_at = self._deserialize_datetime(session_record["ended_at"])
        session_entity.status = str(session_record["status"])
        session_entity.message_count = int(session_record["message_count"])
        session_entity.updated_at = self._deserialize_datetime(session_record["updated_at"])
        return session_entity

    def _map_message_to_record(self, message: SessionMessageEntity) -> dict[str, Any]:
        return {
            "id": message.id,
            "session_id": message.session_id,
            "author": message.author,
            "content": message.content,
            "timestamp": message.timestamp,
            "image_path": message.image_path,
            "audio_path": message.audio_path,
            "error_message": message.error_message,
            "interrupted": message.interrupted,
        }

    def _map_record_to_message(self, message_record: dict[str, Any]) -> SessionMessageEntity:
        return SessionMessageEntity(
            id=str(message_record["id"]),
            session_id=str(message_record["session_id"]),
            author=str(message_record.get("author", message_record.get("role", "assistant"))),
            content=str(message_record.get("content", "")),
            timestamp=float(message_record.get("timestamp", 0)),
            image_path=str(message_record["image_path"]) if message_record.get("image_path") is not None else None,
            audio_path=str(message_record["audio_path"]) if message_record.get("audio_path") is not None else None,
            error_message=(
                str(message_record["error_message"]) if message_record.get("error_message") is not None else None
            ),
            interrupted=bool(message_record.get("interrupted", False)),
        )

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
