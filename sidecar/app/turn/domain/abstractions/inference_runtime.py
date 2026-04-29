"""Inference runtime contracts for the turn feature."""

from __future__ import annotations

from abc import ABC, abstractmethod

from sidecar.app.turn.domain.abstractions.inference_engine import InferenceEngine


class InferenceRuntime(ABC):
    """Lifecycle contract for inference runtime implementations."""

    @abstractmethod
    def load(self) -> tuple[InferenceEngine, str]:
        """Load the runtime and return the engine plus active backend."""
        raise NotImplementedError

    @abstractmethod
    def pre_warm(self) -> None:
        """Warm the runtime after load."""
        raise NotImplementedError

    @abstractmethod
    def close(self) -> None:
        """Release runtime resources."""
        raise NotImplementedError
