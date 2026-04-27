"""Health endpoint controller."""

from __future__ import annotations

from fastapi import APIRouter

from sidecar.http.state import get_app_state

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, object]:
    """Return sidecar health and runtime metadata."""
    state = get_app_state()
    return {
        "status": "ok",
        "model_loaded": state.engine is not None,
        "backend": state.active_backend,
        "model": state.config.model.file or "unknown",
        "vision_tokens": str(state.config.inference.vision_token_budget),
    }
