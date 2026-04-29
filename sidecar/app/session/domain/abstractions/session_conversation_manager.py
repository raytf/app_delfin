"""Session-scoped conversation management contracts."""

from __future__ import annotations

from abc import ABC, abstractmethod

from sidecar.app.turn.domain.abstractions.turn_conversation import TurnConversation


class SessionConversationManager(ABC):
    """Manage inference conversations."""

    @abstractmethod
    async def create(self, session_id: str, preset_id: str) -> TurnConversation:
        """Create and store a fresh conversation for a session."""
        raise NotImplementedError

    @abstractmethod
    async def get(self, session_id: str) -> TurnConversation:
        """Return the existing conversation for a session."""
        raise NotImplementedError

    @abstractmethod
    async def reset(self, session_id: str, preset_id: str) -> TurnConversation:
        """Replace the existing conversation for a session."""
        raise NotImplementedError

    @abstractmethod
    async def close(self, session_id: str) -> None:
        """Close and remove a session conversation if it exists."""
        raise NotImplementedError
