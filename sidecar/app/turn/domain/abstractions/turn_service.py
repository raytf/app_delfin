"""Turn feature service contracts."""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod

from sidecar.app.turn.domain.abstractions.turn_streamer import TurnStreamer
from sidecar.app.turn.domain.dtos.turn_dtos import TurnRequestDto


class TurnService(ABC):
    """Application contract for executing a single turn."""

    @abstractmethod
    async def handle_turn(
        self,
        turn_request: TurnRequestDto,
        streamer: TurnStreamer,
        interrupted: asyncio.Event,
    ) -> None:
        """Process a turn request and stream events through the output port."""
        raise NotImplementedError
