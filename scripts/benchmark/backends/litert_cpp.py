"""LiteRT-LM C++ proxy benchmark adapter.

This backend intentionally reuses the existing Delfin sidecar WebSocket
protocol so we measure the real integration surface that Electron talks to.
The proxy is expected to expose the same /health and /ws endpoints as the
Python sidecar.
"""

from backends.litert import LiteRTBackend


class LiteRTCppBackend(LiteRTBackend):
    """Benchmark adapter for the LiteRT C++ WebSocket proxy."""
