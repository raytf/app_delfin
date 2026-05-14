"""LiteRT-LM C++ benchmark adapter — the primary Delfin backend.

Connects to the TypeScript sidecar (sidecar/src/) over the Delfin WebSocket
protocol — the same /health and /ws contract the Electron app uses. The
sidecar drives the delfin_litert_bridge C++ kernel.

Reuses LiteRTBackend's WebSocket turn loop unchanged (the /ws protocol is
identical to the deprecated Python sidecar). Only /health differs: the
TypeScript sidecar nests engine details under an `engine` object rather than
the Python sidecar's flat payload, so get_info() is overridden here.
"""

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
