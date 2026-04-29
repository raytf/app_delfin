"""FastAPI app factory and lifespan wiring."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sidecar.app.session.infrastructure.in_memory_session_conversation_manager import (
    InMemorySessionConversationManager,
)
from sidecar.app.session.repositories.file_session_repository import FileSessionRepository
from sidecar.app.session.domain.services.session_service_impl import SessionServiceImpl
from sidecar.app.turn.domain.services.turn_service_impl import TurnServiceImpl
from sidecar.app.turn.infrastructure.litert_inference_runtime import LiteRTInferenceRuntime
from sidecar.config import SidecarConfig
from sidecar.http.exception_handlers import register_exception_handlers
from sidecar.http.state import AppState, set_app_state
from sidecar.http.routes import configure_routes
from sidecar.tts.pipeline import TTSPipeline


def create_app(config: SidecarConfig) -> FastAPI:
    """Create the FastAPI application."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        del app

        state = AppState(config=config)
        runtime = LiteRTInferenceRuntime(config)
        state.inference_runtime = runtime

        loop = asyncio.get_running_loop()
        state.engine, state.active_backend = await loop.run_in_executor(None, runtime.load)
        await loop.run_in_executor(None, runtime.pre_warm)

        if config.tts.enabled:
            state.tts_provider = TTSPipeline(config)

        session_storage_root = Path(__file__).resolve().parents[1] / "data" / "sessions"
        state.session_repository = FileSessionRepository(session_storage_root)
        session_conversation_manager = InMemorySessionConversationManager(state.engine)
        state.session_service = SessionServiceImpl(
            session_repository=state.session_repository,
            session_conversation_manager=session_conversation_manager,
        )
        state.turn_service = TurnServiceImpl(
            session_conversation_manager=session_conversation_manager,
            session_service=state.session_service,
            tts_provider=state.tts_provider,
        )
        set_app_state(state)
        yield
        runtime.close()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    configure_routes(app)
    return app
