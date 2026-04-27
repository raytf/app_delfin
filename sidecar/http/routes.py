"""Route registration for the FastAPI app."""

from __future__ import annotations

from fastapi import FastAPI

from sidecar.http.controllers.health_controller import router as health_router
from sidecar.http.controllers.ws_controller import router as ws_router


def configure_routes(app: FastAPI) -> None:
    """Register HTTP and WebSocket routes on the FastAPI app."""
    app.include_router(health_router)
    app.include_router(ws_router)
