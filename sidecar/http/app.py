"""FastAPI app factory and lifespan wiring."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sidecar.application.services.turn_service import TurnService
from sidecar.config import SidecarConfig
from sidecar.http.state import AppState, set_app_state
from sidecar.inference.litert_engine import LiteRTInferenceRuntime
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

        state.turn_service = TurnService(tts_provider=state.tts_provider)
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
    from sidecar.http.routes import configure_routes

    configure_routes(app)
    return app
