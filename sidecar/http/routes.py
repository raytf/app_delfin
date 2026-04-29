"""Route registration for the FastAPI app."""

from fastapi import FastAPI

from sidecar.app.app_controller import router as health_router
from sidecar.app.session.controllers.session_controller import router as session_router
from sidecar.app.turn.controllers.turn_controller import router as turn_router


def configure_routes(app: FastAPI) -> None:
    """Register HTTP and WebSocket routes on the FastAPI app."""
    app.include_router(health_router)
    app.include_router(session_router)
    app.include_router(turn_router)
