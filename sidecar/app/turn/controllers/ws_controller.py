"""Turn WebSocket controller factory."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter
from fastapi import WebSocket, WebSocketDisconnect

from sidecar.app.turn.controllers.websocket_turn_streamer import WebSocketTurnStreamer
from sidecar.app.turn.domain.abstractions.turn_service import TurnService
from sidecar.app.turn.domain.dtos.turn_dtos import TurnRequestDto
from sidecar.app.turn.domain.enums.socket_message_type import TurnInboundSocketEvent

logger = logging.getLogger(__name__)


def create_router(turn_service: TurnService) -> APIRouter:
    """Create the turn WebSocket router with explicit dependencies."""
    router = APIRouter()

    @router.websocket("/ws")
    async def ws_endpoint(ws: WebSocket) -> None:
        """Handle sidecar WebSocket traffic using a single-consumer queue."""
        await ws.accept()
        streamer = WebSocketTurnStreamer(ws)
        interrupted = asyncio.Event()
        msg_queue: asyncio.Queue[TurnRequestDto | None] = asyncio.Queue()

        async def receiver() -> None:
            try:
                while True:
                    try:
                        raw = await ws.receive_text()
                        payload = json.loads(raw)
                    except json.JSONDecodeError:
                        await streamer.send_error("Invalid JSON payload.")
                        continue

                    if _is_interrupt_event(payload):
                        logger.info("[receiver] interrupt received")
                        interrupted.set()
                        continue

                    turn_request = _map_turn_request(payload)
                    if turn_request is None:
                        await streamer.send_error("Request must include session_id.")
                        continue
                    await msg_queue.put(turn_request)
            except WebSocketDisconnect:
                await msg_queue.put(None)
            except Exception as exc:
                logger.exception("WebSocket receive error: %s", exc)
                await streamer.send_error(str(exc))
                await msg_queue.put(None)

        recv_task = asyncio.create_task(receiver())

        try:
            while True:
                turn_request = await msg_queue.get()
                if turn_request is None:
                    break
                interrupted.clear()

                await turn_service.handle_turn(
                    turn_request=turn_request,
                    streamer=streamer,
                    interrupted=interrupted,
                )
        finally:
            recv_task.cancel()

    return router


def _is_interrupt_event(payload: dict[str, object]) -> bool:
    event_type = payload.get("type")
    return event_type == TurnInboundSocketEvent.INTERRUPT.value


def _map_turn_request(payload: dict[str, object]) -> TurnRequestDto | None:
    session_id = payload.get("session_id")
    if not isinstance(session_id, str) or not session_id.strip():
        return None

    image_value = payload.get("image")
    audio_value = payload.get("audio")
    text_value = payload.get("text")

    return TurnRequestDto(
        session_id=session_id,
        text=text_value if isinstance(text_value, str) else None,
        image_base64=image_value if isinstance(image_value, str) else None,
        audio_base64=audio_value if isinstance(audio_value, str) else None,
    )
