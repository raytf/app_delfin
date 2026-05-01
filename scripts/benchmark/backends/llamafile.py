"""llamafile / llama-server backend adapter.

Connects to a running llamafile or llama-server instance via its
OpenAI-compatible REST API.

Supports two modes:
  1. Auto-launch: pass --llamafile-bin and (optionally) --llamafile-model.
     The benchmark spawns the process, waits for it to be ready, and shuts
     it down on exit. The spawned PID is used for RSS memory tracking.
  2. Connect-only: pass --llamafile-host to an already-running server.
     RSS tracking requires --sidecar-pid from the caller.

Vision (S2) uses the OpenAI image_url content type:
  {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}

Multi-turn (S3): llamafile is stateless per-request; the full conversation
history is accumulated in memory and sent in each subsequent request.
Token counts come from usage.completion_tokens in the final SSE chunk,
so throughput is exact (labelled token_count_exact=True).
"""

from __future__ import annotations

import asyncio
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

import httpx

from backends.base import BaseBackend
from backends.memory import MemoryPoller
from scenarios import Scenario


class LlamafileBackend(BaseBackend):
    def __init__(
        self,
        host: str = "localhost:8080",
        bin_path: str | None = None,
        model_path: str | None = None,
        sidecar_pid: int | None = None,
    ):
        self.host = host
        self.url = f"http://{host}"
        self.bin_path = bin_path
        self.model_path = model_path
        self._external_pid = sidecar_pid
        self._process: subprocess.Popen | None = None
        self._launched_pid: int | None = None

    # ------------------------------------------------------------------
    # Context manager — launch / shutdown if bin_path provided
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "LlamafileBackend":
        if self.bin_path:
            await self._launch()
        return self

    async def __aexit__(self, *_) -> None:
        if self._process is not None:
            self._process.terminate()
            try:
                self._process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None
            self._launched_pid = None

    async def _launch(self) -> None:
        port = self.host.split(":")[-1]
        cmd = [
            self.bin_path,
            "--host", "127.0.0.1",
            "--port", port,
            "--ctx-size", "8192",
            "--no-mmap",
        ]
        if self.model_path:
            cmd += ["--model", self.model_path]

        print(f"  Launching: {' '.join(str(c) for c in cmd)}")
        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self._launched_pid = self._process.pid

        # Poll until server is ready (model loading can take up to ~2 min)
        print("  Waiting for model to load", end="", flush=True)
        for _ in range(300):  # 150 s max
            await asyncio.sleep(0.5)
            if self._process.poll() is not None:
                raise RuntimeError(
                    f"llamafile/llama-server exited unexpectedly (code {self._process.returncode}). "
                    "Check binary path and model path."
                )
            if await self._is_ready():
                print(" ready.")
                return
            print(".", end="", flush=True)
        raise RuntimeError("Server did not become ready within 150 s.")

    async def _is_ready(self) -> bool:
        """Return True when the server reports status ok (not 'loading model')."""
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"{self.url}/health")
                if r.status_code == 200:
                    body = r.json()
                    # llama-server returns {"status": "loading model"} while busy
                    return body.get("status") == "ok"
                return False
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Health / info
    # ------------------------------------------------------------------

    async def health_check(self) -> bool:
        return await self._is_ready()

    async def get_info(self) -> str:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{self.url}/v1/models")
                models = [m["id"] for m in r.json().get("data", [])]
                return f"models={models}"
        except Exception:
            return "connected (info unavailable)"

    # ------------------------------------------------------------------
    # Scenario execution
    # ------------------------------------------------------------------

    async def run_scenario(self, scenario: Scenario) -> list[dict]:
        """Run all turns, accumulating conversation history for multi-turn."""
        pid = self._launched_pid or self._external_pid
        messages: list[dict] = []
        results: list[dict] = []

        for turn in scenario.turns:
            # Build the user message content
            content: list[dict] | str
            if turn.image_path is not None:
                raw = Path(turn.image_path).read_bytes()
                b64 = base64.b64encode(raw).decode("ascii")
                content = [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                    {"type": "text", "text": turn.text},
                ]
            else:
                content = turn.text  # plain string is fine for text-only turns

            messages.append({"role": "user", "content": content})

            result = await self._run_turn(messages, pid)
            result["turn_text_preview"] = turn.text[:80]
            results.append(result)

            # Append assistant reply so next turn has full context
            messages.append({"role": "assistant", "content": result["output_text_preview"]})

        return results

    async def _run_turn(self, messages: list[dict], pid: int | None) -> dict:
        """POST one streaming chat-completions request and collect metrics."""
        payload = {
            "model": "local-model",   # llama-server ignores this field
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},  # final chunk has usage stats
            "max_tokens": 512,
            "temperature": 0.0,       # deterministic for reproducibility
        }

        poller = MemoryPoller(pid) if pid else None
        tokens: list[str] = []
        ttft_ms: float | None = None
        completion_tokens: int | None = None

        if poller:
            poller.start()

        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                t_send = time.perf_counter()
                async with client.stream(
                    "POST",
                    f"{self.url}/v1/chat/completions",
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data.strip() == "[DONE]":
                            break

                        chunk = json.loads(data)

                        # Extract exact token count from the final usage chunk
                        usage = chunk.get("usage")
                        if usage and usage.get("completion_tokens"):
                            completion_tokens = usage["completion_tokens"]

                        delta = (chunk.get("choices") or [{}])[0].get("delta", {})
                        content_piece = delta.get("content", "")
                        if content_piece:
                            if ttft_ms is None:
                                ttft_ms = (time.perf_counter() - t_send) * 1000
                            tokens.append(content_piece)
        finally:
            if poller:
                await poller.stop()

        t_done = time.perf_counter()
        total_turn_ms = (t_done - t_send) * 1000
        full_text = "".join(tokens)

        # Prefer exact count from usage field; fall back to estimate
        token_count = completion_tokens or _estimate_tokens(full_text)
        exact = completion_tokens is not None

        gen_time_s = max((total_turn_ms - (ttft_ms or 0)) / 1000, 0.001)
        throughput = token_count / gen_time_s if token_count > 0 else 0.0

        return {
            "ttft_ms": round(ttft_ms or 0.0, 2),
            "throughput_tokens_per_sec": round(throughput, 2),
            "total_turn_ms": round(total_turn_ms, 2),
            "output_token_count": token_count,
            "token_count_exact": exact,
            "peak_rss_mb": round(poller.peak_mb, 1) if poller else None,
            "output_text_preview": full_text[:120],
        }


def _estimate_tokens(text: str) -> int:
    return max(len(text) // 4, len(text.split()))
