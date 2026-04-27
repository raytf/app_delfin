"""Inference-layer interfaces."""

from __future__ import annotations

from typing import Any, Protocol


class Conversation(Protocol):
    """Protocol for a stateful inference conversation."""

    def __enter__(self) -> "Conversation": ...

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None: ...

    def send_message_async(self, message: dict[str, Any]) -> Any: ...


class InferenceEngine(Protocol):
    """Protocol for an engine that creates conversations."""

    def create_conversation(self, messages: list[dict[str, Any]]) -> Conversation: ...


class InferenceRuntime(Protocol):
    """Protocol for inference runtime setup and teardown."""

    engine: InferenceEngine
    active_backend: str

    def load(self) -> tuple[InferenceEngine, str]: ...

    def pre_warm(self) -> None: ...

    def close(self) -> None: ...
