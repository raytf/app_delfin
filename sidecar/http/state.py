"""Shared application state access for the HTTP layer."""

from __future__ import annotations

from dataclasses import dataclass

from sidecar.app.session.domain.abstractions.session_repository import SessionRepository
from sidecar.app.session.domain.abstractions.session_service import SessionService
from sidecar.application.services.turn_service import TurnService
from sidecar.config import SidecarConfig
from sidecar.inference.litert_engine import LiteRTInferenceRuntime
from sidecar.tts.pipeline import TTSPipeline


@dataclass
class AppState:
    """Shared runtime state for the sidecar app."""

    config: SidecarConfig
    engine: object | None = None
    active_backend: str = "CPU"
    tts_provider: TTSPipeline | None = None
    turn_service: TurnService | None = None
    inference_runtime: LiteRTInferenceRuntime | None = None
    session_repository: SessionRepository | None = None
    session_service: SessionService | None = None


_app_state: AppState | None = None


def get_app_state() -> AppState:
    """Return the initialized application state."""
    if _app_state is None:
        raise RuntimeError("App state is not initialized.")
    return _app_state


def set_app_state(state: AppState) -> None:
    """Store the initialized application state."""
    global _app_state
    _app_state = state
