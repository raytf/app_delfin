"""LiteRT-LM C++ benchmark adapter — the primary Delfin backend.

Connects to the TypeScript sidecar (sidecar/src/) over the Delfin WebSocket
protocol — the same /health, /sessions, and /ws contract the Electron app uses.
The sidecar drives the delfin_litert_bridge C++ kernel.

Reuses LiteRTBackend's WebSocket turn loop, but overrides the surfaces that
differ from the deprecated Python sidecar:
  - /health: the TypeScript sidecar nests engine details under an `engine`
    object rather than a flat payload (get_info).
  - /sessions: WS turns require a real, active sessionId, so each scenario run
    creates a session via REST and deletes it afterwards
    (_acquire_session_id / _release_session).
  - /ws turn requests: the schema requires requestId + sessionId and uses
    imageBase64 / audioBase64 keys (_build_turn_message).
"""

import base64
from pathlib import Path

import httpx

from backends.litert import LiteRTBackend


class LiteRTCppBackend(LiteRTBackend):
    """Benchmark adapter for the TypeScript sidecar + LiteRT-LM C++ bridge."""

    async def get_info(self) -> str:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self._http_base}/health")
                engine = r.json().get("engine", {})
                return (
                    f"backend={engine.get('backend', '?')}  "
                    f"model={engine.get('model', '?')}  "
                    f"ready={engine.get('ready', '?')}"
                )
        except Exception:
            return "connected (info unavailable)"

    async def _acquire_session_id(self) -> str:
        """Create a session via the TypeScript sidecar's REST API.

        WS turns require an existing, active sessionId (see
        turn-service-impl.ts) — a throwaway UUID is rejected with
        "Session not found".
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{self._http_base}/sessions",
                json={"name": "benchmark", "presetId": "generic-screen"},
            )
            r.raise_for_status()
            session = r.json().get("data") or {}
            session_id = session.get("id")
            if not session_id:
                raise RuntimeError(f"Could not read session id from: {r.text}")
            return session_id

    async def _release_session(self, session_id: str) -> None:
        """Delete the benchmark session so runs don't accumulate on disk."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.delete(f"{self._http_base}/sessions/{session_id}")
        except Exception:
            pass  # best-effort cleanup

    def _build_turn_message(self, turn, request_id: str, session_id: str) -> dict:
        """Outbound turn message for the TypeScript sidecar.

        Matches sidecar/src/app/turn/controllers/validations/ws-request-validation.ts:
        requestId + sessionId required, presetId, and at least one of
        text / imageBase64 / audioBase64.
        """
        msg: dict = {
            "type": "turn",
            "requestId": request_id,
            "sessionId": session_id,
            "presetId": "generic-screen",
            "text": turn.text,
        }
        if turn.image_path is not None:
            raw = Path(turn.image_path).read_bytes()
            msg["imageBase64"] = base64.b64encode(raw).decode("ascii")
        return msg
