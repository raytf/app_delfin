"""WebSocket-backed turn streamer adapter."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import WebSocket

from sidecar.app.turn.domain.abstractions.turn_streamer import TurnStreamer
from sidecar.app.turn.domain.dtos.turn_dtos import TurnStreamEventDto
from sidecar.app.turn.domain.enums.socket_message_type import TurnOutboundSocketEvent


class WebSocketTurnStreamer(TurnStreamer):
    """Turn streamer that emits JSON messages over a FastAPI WebSocket."""

    def __init__(self, ws: WebSocket) -> None:
        self._ws = ws

    async def send_token(self, text: str) -> None:
        await self._send_event(TurnStreamEventDto(type=TurnOutboundSocketEvent.TOKEN, text=text))

    async def send_structured(self, data: object) -> None:
        await self._send_event(TurnStreamEventDto(type=TurnOutboundSocketEvent.STRUCTURED, data=data))

    async def send_audio_start(self, sample_rate: int, sentence_count: int) -> None:
        await self._send_event(
            TurnStreamEventDto(
                type=TurnOutboundSocketEvent.AUDIO_START,
                sample_rate=sample_rate,
                sentence_count=sentence_count,
            )
        )

    async def send_audio_chunk(self, audio: str, index: int | None = None) -> None:
        await self._send_event(
            TurnStreamEventDto(
                type=TurnOutboundSocketEvent.AUDIO_CHUNK,
                audio=audio,
                index=index,
            )
        )

    async def send_audio_end(self, tts_time: float) -> None:
        await self._send_event(
            TurnStreamEventDto(
                type=TurnOutboundSocketEvent.AUDIO_END,
                tts_time=tts_time,
            )
        )

    async def send_done(self) -> None:
        await self._send_event(TurnStreamEventDto(type=TurnOutboundSocketEvent.DONE))

    async def send_error(self, message: str) -> None:
        await self._send_event(TurnStreamEventDto(type=TurnOutboundSocketEvent.ERROR, message=message))

    async def _send_event(self, event: TurnStreamEventDto) -> None:
        payload = {key: value for key, value in asdict(event).items() if value is not None}
        payload["type"] = event.type.value
        await self._ws.send_json(payload)
