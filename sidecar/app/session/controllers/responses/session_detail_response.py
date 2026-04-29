"""Response model for session detail payloads."""

from __future__ import annotations

from sidecar.app.session.controllers.responses.session_message_response import SessionMessageResponse
from sidecar.app.session.controllers.responses.session_response import SessionResponse


class SessionDetailResponse(SessionResponse):
    """Serialized session detail payload."""

    messages: list[SessionMessageResponse]
