"""HTTP handlers for session CRUD operations."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from sidecar.app.session.controllers.responses.session_response import SessionResponse
from sidecar.app.session.controllers.validations.create_session_validation import CreateSessionValidation
from sidecar.app.session.controllers.validations.update_session_validation import UpdateSessionValidation
from sidecar.app.session.domain.abstractions.session_service import SessionService
from sidecar.app.session.domain.dtos.create_session_dto import CreateSessionDto
from sidecar.app.session.domain.dtos.update_session_dto import UpdateSessionDto
from sidecar.app.session.domain.exceptions.session_not_found_error import SessionNotFoundError
from sidecar.http.state import get_app_state

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse)
async def create_session(request_body: CreateSessionValidation) -> SessionResponse:
    """Create a new session."""
    session_service = _get_session_service()
    return await session_service.create(CreateSessionDto(session_name=request_body.session_name))


@router.get("", response_model=list[SessionResponse])
async def get_sessions() -> list[SessionResponse]:
    """Return all sessions."""
    session_service = _get_session_service()
    return await session_service.get()


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session_by_id(session_id: str) -> SessionResponse:
    """Return a single session."""
    session_service = _get_session_service()
    try:
        return await session_service.get_one_by_id(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session_by_id(session_id: str, request_body: UpdateSessionValidation) -> SessionResponse:
    """Update a session."""
    session_service = _get_session_service()
    try:
        return await session_service.update_by_id(
            session_id,
            UpdateSessionDto(session_name=request_body.session_name),
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")


@router.patch("/{session_id}/end", response_model=SessionResponse)
async def end_session_by_id(session_id: str) -> SessionResponse:
    """End a session."""
    session_service = _get_session_service()
    try:
        return await session_service.end_by_id(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session_by_id(session_id: str) -> Response:
    """Delete a session."""
    session_service = _get_session_service()
    await session_service.delete_by_id(session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _get_session_service() -> SessionService:
    state = get_app_state()
    session_service = state.session_service
    if session_service is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Session service is not ready.")
    return session_service
