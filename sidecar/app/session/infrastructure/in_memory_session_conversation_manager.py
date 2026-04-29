"""In-memory session conversation manager."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from sidecar.app.session.domain.abstractions.session_conversation_manager import SessionConversationManager
from sidecar.app.turn.domain.abstractions.inference_engine import InferenceEngine
from sidecar.app.turn.domain.abstractions.turn_conversation import TurnConversation
from sidecar.inference.prompts.presets import PRESETS
from sidecar.shared.exceptions import NotFoundException


@dataclass
class _SessionConversationEntry:
    conversation: TurnConversation
    preset_id: str


class InMemorySessionConversationManager(SessionConversationManager):
    """Store active conversations in memory keyed by session id."""

    def __init__(self, engine: InferenceEngine) -> None:
        self._engine = engine
        self._conversations: dict[str, _SessionConversationEntry] = {}
        self._lock = asyncio.Lock()

    async def create(self, session_id: str, preset_id: str) -> TurnConversation:
        """Create and store a fresh conversation for a session."""
        async with self._lock:
            self._close_existing_if_present(session_id)
            conversation = self._create_conversation(preset_id)
            self._conversations[session_id] = _SessionConversationEntry(
                conversation=conversation,
                preset_id=preset_id,
            )
            return conversation

    async def get(self, session_id: str) -> TurnConversation:
        """Return the existing conversation for a session."""
        async with self._lock:
            entry = self._conversations.get(session_id)
            if entry is None:
                raise NotFoundException(f"Session conversation not found: {session_id}")
            return entry.conversation

    async def reset(self, session_id: str, preset_id: str) -> TurnConversation:
        """Replace the existing conversation for a session."""
        return await self.create(session_id=session_id, preset_id=preset_id)

    async def close(self, session_id: str) -> None:
        """Close and remove a session conversation if it exists."""
        async with self._lock:
            self._close_existing_if_present(session_id)

    def _create_conversation(self, preset_id: str) -> TurnConversation:
        resolved_preset_id = preset_id if preset_id in PRESETS else "lecture-slide"
        conversation = self._engine.create_conversation(
            messages=[{"role": "system", "content": [{"type": "text", "text": PRESETS[resolved_preset_id]}]}],
        )
        conversation.__enter__()
        return conversation

    def _close_existing_if_present(self, session_id: str) -> None:
        existing = self._conversations.pop(session_id, None)
        if existing is not None:
            existing.conversation.__exit__(None, None, None)
