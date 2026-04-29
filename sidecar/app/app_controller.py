"""Health endpoint controller."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from sidecar.http.state import get_app_state
from sidecar.shared.http_responses import HttpSuccessResponse, build_success_response

router = APIRouter()


class HealthResponse(BaseModel):
    """Serialized health response payload."""

    status: str
    model_loaded: bool
    backend: str
    model: str
    vision_tokens: str


@router.get("/health", response_model=HttpSuccessResponse[HealthResponse])
async def health() -> HttpSuccessResponse[HealthResponse]:
    """Return sidecar health and runtime metadata."""
    state = get_app_state()
    return build_success_response(
        HealthResponse(
            status="ok",
            model_loaded=state.engine is not None,
            backend=state.active_backend,
            model=state.config.model.file or "unknown",
            vision_tokens=str(state.config.inference.vision_token_budget),
        )
    )
