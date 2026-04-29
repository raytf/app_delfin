"""Inference engine contracts for the turn feature."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sidecar.app.turn.domain.abstractions.turn_conversation import TurnConversation


class InferenceEngine(ABC):
    """Contract for engines that create turn conversations."""

    @abstractmethod
    def create_conversation(self, messages: list[dict[str, Any]] | None = None) -> TurnConversation:
        """Create a stateful conversation with optional initial messages."""
        raise NotImplementedError
