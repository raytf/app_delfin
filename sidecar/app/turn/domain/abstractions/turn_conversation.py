"""Conversation contracts for the turn feature."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class TurnConversation(ABC):
    """Contract for a stateful inference conversation."""

    @abstractmethod
    def __enter__(self) -> "TurnConversation":
        """Enter the conversation context."""
        raise NotImplementedError

    @abstractmethod
    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        """Exit the conversation context."""
        raise NotImplementedError

    @abstractmethod
    def send_message_async(self, message: dict[str, Any]) -> Any:
        """Send a message and return a stream-like response iterator."""
        raise NotImplementedError
