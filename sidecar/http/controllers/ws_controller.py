"""WebSocket controller."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from sidecar.http.state import get_app_state
from sidecar.inference.prompts.presets import PRESETS

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    """Handle sidecar WebSocket traffic using a single-consumer queue."""
    state = get_app_state()
    engine = state.engine
    turn_service = state.turn_service
    if engine is None:
        await ws.accept()
        await ws.send_json({"type": "error", "message": "Inference engine is not ready."})
        await ws.close()
        return
    if turn_service is None:
        await ws.accept()
        await ws.send_json({"type": "error", "message": "Turn service is not ready."})
        await ws.close()
        return

    await ws.accept()
    interrupted = asyncio.Event()

    preset_id = "lecture-slide"

    conversation = engine.create_conversation(
        messages=[{"role": "system", "content": [{"type": "text", "text": PRESETS[preset_id]}]}],
    )
    conversation.__enter__()

    msg_queue: asyncio.Queue[dict[str, object] | None] = asyncio.Queue()

    async def receiver() -> None:
        try:
            while True:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                if msg.get("type") == "interrupt":
                    logger.info("[receiver] interrupt received")
                    interrupted.set()
                else:
                    nonlocal preset_id
                    if "preset_id" in msg and msg["preset_id"] in PRESETS:
                        preset_id = str(msg["preset_id"])
                    await msg_queue.put(msg)
        except WebSocketDisconnect:
            await msg_queue.put(None)

    recv_task = asyncio.create_task(receiver())

    try:
        while True:
            msg = await msg_queue.get()
            if msg is None:
                break
            interrupted.clear()
            await turn_service.handle_turn(ws, conversation, msg, interrupted)
    finally:
        recv_task.cancel()
        conversation.__exit__(None, None, None)
