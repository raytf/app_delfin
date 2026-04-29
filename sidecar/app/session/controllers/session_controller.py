"""HTTP handlers for session CRUD operations."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from sidecar.app.session.controllers.responses.session_detail_response import SessionDetailResponse
from sidecar.app.session.controllers.responses.session_message_response import SessionMessageResponse
from sidecar.app.session.controllers.responses.session_response import SessionResponse
from sidecar.app.session.controllers.validations.create_session_validation import CreateSessionValidation
from sidecar.app.session.controllers.validations.update_session_validation import UpdateSessionValidation
from sidecar.app.session.domain.aggregates.session_aggregate import SessionAggregate
from sidecar.app.session.domain.abstractions.session_service import SessionService
from sidecar.app.session.domain.dtos.create_session_dto import CreateSessionDto
from sidecar.app.session.domain.dtos.update_session_dto import UpdateSessionDto
from sidecar.http.state import get_app_state
from sidecar.shared.http_responses import HttpSuccessResponse, build_success_response

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=HttpSuccessResponse[SessionResponse])
async def create_session(request_body: CreateSessionValidation) -> HttpSuccessResponse[SessionResponse]:
    """Create a new session."""
    session_service = _get_session_service()
    session = await session_service.create(
        CreateSessionDto(
            session_name=request_body.session_name,
            preset_id=request_body.preset_id,
        )
    )
    return build_success_response(session)


@router.get("", response_model=HttpSuccessResponse[list[SessionResponse]])
async def get_sessions() -> HttpSuccessResponse[list[SessionResponse]]:
    """Return all sessions."""
    session_service = _get_session_service()
    sessions = await session_service.get()
    return build_success_response(sessions)


@router.get("/{session_id}", response_model=HttpSuccessResponse[SessionDetailResponse])
async def get_session_by_id(session_id: str) -> HttpSuccessResponse[SessionDetailResponse]:
    """Return a single session with its persisted messages."""
    session_service = _get_session_service()
    session_aggregate = await session_service.get_one_by_id(session_id)
    return build_success_response(_map_session_aggregate_to_response(session_aggregate))


@router.patch("/{session_id}", response_model=HttpSuccessResponse[SessionResponse])
async def update_session_by_id(
    session_id: str,
    request_body: UpdateSessionValidation,
) -> HttpSuccessResponse[SessionResponse]:
    """Update a session."""
    session_service = _get_session_service()
    session = await session_service.update_by_id(
        session_id,
        UpdateSessionDto(session_name=request_body.session_name),
    )
    return build_success_response(session)


@router.patch("/{session_id}/end", response_model=HttpSuccessResponse[SessionResponse])
async def end_session_by_id(session_id: str) -> HttpSuccessResponse[SessionResponse]:
    """End a session."""
    session_service = _get_session_service()
    session = await session_service.end_by_id(session_id)
    return build_success_response(session)


@router.delete("/{session_id}", status_code=status.HTTP_200_OK, response_model=HttpSuccessResponse[None])
async def delete_session_by_id(session_id: str) -> HttpSuccessResponse[None]:
    """Delete a session."""
    session_service = _get_session_service()
    await session_service.delete_by_id(session_id)
    return build_success_response(None)


def _get_session_service() -> SessionService:
    state = get_app_state()
    session_service = state.session_service
    if session_service is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Session service is not ready.")
    return session_service


def _map_session_aggregate_to_response(session_aggregate: SessionAggregate) -> SessionDetailResponse:
    session = SessionResponse.model_validate(session_aggregate)
    return SessionDetailResponse(
        id=session.id,
        name=session.name,
        preset_id=session.preset_id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        status=session.status,
        message_count=session.message_count,
        updated_at=session.updated_at,
        messages=[
            SessionMessageResponse(
                id=message.id,
                session_id=message.session_id,
                author=message.author,
                content=message.content,
                timestamp=message.timestamp,
                image_path=message.image_path,
                audio_path=message.audio_path,
                error_message=message.error_message,
                interrupted=message.interrupted,
            )
            for message in session_aggregate.messages
        ],
    )
