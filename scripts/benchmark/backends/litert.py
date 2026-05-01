"""LiteRT-LM backend adapter.

Connects to the existing Delfin FastAPI sidecar over WebSocket.

Protocol (from sidecar/server.py):
  → send JSON: {"text": "...", "image": "<base64>", "preset_id": "..."}
  ← recv JSON: {"type": "token", "text": "..."}  (streaming)
  ← recv JSON: {"type": "done"}                   (generation complete)
  ← recv JSON: {"type": "error", "message": "..."}

Each call to run_scenario() opens a fresh WebSocket connection, which
gives a fresh conversation context in the sidecar. For multi-turn scenarios
(S3), the same connection is kept open across all turns so the sidecar
accumulates conversation history naturally.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from pathlib import Path

import httpx
import websockets

from backends.base import BaseBackend
from backends.memory import MemoryPoller
from scenarios import Scenario


class LiteRTBackend(BaseBackend):
    def __init__(self, host: str = "localhost:8321", sidecar_pid: int | None = None):
        self.host = host
        self.url = f"ws://{host}/ws"
        self._http_base = f"http://{host}"
        self.sidecar_pid = sidecar_pid

    # ------------------------------------------------------------------
    # Health / info
    # ------------------------------------------------------------------

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self._http_base}/health")
                return r.status_code == 200 and r.json().get("status") == "ok"
        except Exception:
            return False

    async def get_info(self) -> str:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self._http_base}/health")
                d = r.json()
                return (
                    f"backend={d.get('backend', '?')}  "
                    f"model={d.get('model', '?')}  "
                    f"vision_tokens={d.get('vision_tokens', '?')}"
                )
        except Exception:
            return "connected (info unavailable)"

    # ------------------------------------------------------------------
    # Scenario execution
    # ------------------------------------------------------------------

    async def run_scenario(self, scenario: Scenario) -> list[dict]:
        """Open one WebSocket connection and run all turns sequentially."""
        pid = self.sidecar_pid
        results: list[dict] = []

        async with websockets.connect(self.url, open_timeout=15) as ws:
            for turn in scenario.turns:
                result = await self._run_turn(ws, turn, pid)
                result["turn_text_preview"] = turn.text[:80]
                results.append(result)

        return results

    async def _run_turn(self, ws, turn, pid: int | None) -> dict:
        """Send one message and collect streaming metrics."""
        # Build the outbound message
        msg: dict = {"text": turn.text, "preset_id": "generic-screen"}
        if turn.image_path is not None:
            raw = Path(turn.image_path).read_bytes()
            msg["image"] = base64.b64encode(raw).decode("ascii")

        poller = MemoryPoller(pid) if pid else None
        tokens: list[str] = []
        ttft_ms: float | None = None

        if poller:
            poller.start()

        try:
            t_send = time.perf_counter()
            await ws.send(json.dumps(msg))

            while True:
                raw_msg = await asyncio.wait_for(ws.recv(), timeout=120.0)
                event = json.loads(raw_msg)

                if event["type"] == "token":
                    if ttft_ms is None:
                        ttft_ms = (time.perf_counter() - t_send) * 1000
                    tokens.append(event["text"])

                elif event["type"] == "done":
                    break

                elif event["type"] == "error":
                    raise RuntimeError(f"Sidecar error: {event.get('message', '?')}")

                # Ignore audio_start / audio_chunk / audio_end — TTS is separate
        finally:
            if poller:
                await poller.stop()

        t_done = time.perf_counter()
        total_turn_ms = (t_done - t_send) * 1000
        full_text = "".join(tokens)
        token_count = _estimate_tokens(full_text)
        gen_time_s = max((total_turn_ms - (ttft_ms or 0)) / 1000, 0.001)
        throughput = token_count / gen_time_s if token_count > 0 else 0.0

        return {
            "ttft_ms": round(ttft_ms or 0.0, 2),
            "throughput_tokens_per_sec": round(throughput, 2),
            "total_turn_ms": round(total_turn_ms, 2),
            "output_token_count": token_count,
            "token_count_exact": False,   # LiteRT streams text, not token IDs
            "peak_rss_mb": round(poller.peak_mb, 1) if poller else None,
            "output_text_preview": full_text[:120],
        }


def _estimate_tokens(text: str) -> int:
    """Approximate token count from output text.

    LiteRT streams raw text without token counts. We use the common heuristic
    of ~4 chars per token, cross-checked against word count.
    Note: results labelled token_count_exact=False in JSON output.
    """
    return max(len(text) // 4, len(text.split()))
