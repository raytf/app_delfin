"""Ollama HTTP backend adapter — compatible with the LiteRT engine interface."""

import json
import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)


class OllamaBackend:
    """Thin wrapper around a local Ollama instance."""

    def __init__(self, host: str, model: str) -> None:
        self.host = host.rstrip("/")
        self.model = model

    @classmethod
    def load(cls) -> tuple["OllamaBackend", str]:
        host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
        model = os.environ.get("OLLAMA_MODEL", "gemma4:e2b")

        # Verify Ollama is reachable
        try:
            resp = requests.get(f"{host}/api/tags", timeout=10)
            resp.raise_for_status()
        except Exception as exc:
            logger.warning("Could not reach Ollama at %s: %s", host, exc)
            raise RuntimeError(
                f"Ollama is not running at {host}. Please start Ollama."
            ) from exc

        # Verify model exists
        tags = resp.json()
        model_names = [m.get("name") for m in tags.get("models", [])]
        if model not in model_names:
            logger.warning(
                "Model %s not found in Ollama. Available: %s", model, model_names
            )
            raise RuntimeError(
                f"Ollama model {model} not found. Run: ollama pull {model}"
            )

        logger.info("Ollama backend ready: %s / %s", host, model)
        return cls(host, model), "ollama"

    def __enter__(self) -> "OllamaBackend":
        return self

    def __exit__(self, *args: Any) -> None:
        pass

    def create_conversation(
        self, messages: list[dict] | None = None
    ) -> "OllamaConversation":
        return OllamaConversation(self.host, self.model, messages or [])


class OllamaConversation:
    """Conversation context that mirrors LiteRT-LM's streaming API."""

    def __init__(self, host: str, model: str, messages: list[dict]) -> None:
        self.host = host.rstrip("/")
        self.model = model
        self.messages = messages

    def __enter__(self) -> "OllamaConversation":
        return self

    def __exit__(self, *args: Any) -> None:
        pass

    def send_message(self, message: dict) -> dict:
        """Non-streaming call (used for pre-warm)."""
        self.messages.append(message)
        payload = {
            "model": self.model,
            "messages": _convert_messages(self.messages),
            "stream": False,
        }
        resp = requests.post(
            f"{self.host}/api/chat", json=payload, timeout=120
        )
        resp.raise_for_status()
        return resp.json()

    def send_message_async(self, message: dict):
        """Streaming generator that yields chunks compatible with LiteRT-LM format."""
        import json as _json

        self.messages.append(message)
        payload = {
            "model": self.model,
            "messages": _convert_messages(self.messages),
            "stream": True,
        }

        try:
            with requests.post(
                f"{self.host}/api/chat", json=payload, stream=True, timeout=120
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    try:
                        data = _json.loads(line)
                    except _json.JSONDecodeError:
                        continue

                    if data.get("done"):
                        break

                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield {"content": [{"type": "text", "text": content}]}
        except Exception as exc:
            logger.error("Ollama streaming error: %s", exc)
            raise


def _convert_messages(messages: list[dict]) -> list[dict]:
    """Convert internal Delfin message format to Ollama /api/chat format."""
    result: list[dict] = []
    for msg in messages:
        raw_content = msg.get("content")
        if isinstance(raw_content, str):
            result.append({"role": msg["role"], "content": raw_content})
        elif isinstance(raw_content, list):
            text_parts: list[str] = []
            images: list[str] = []
            for item in raw_content:
                if item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
                elif item.get("type") == "image":
                    images.append(item.get("blob", ""))
            ollama_msg: dict = {
                "role": msg["role"],
                "content": " ".join(text_parts),
            }
            if images:
                ollama_msg["images"] = images
            result.append(ollama_msg)
        else:
            result.append(
                {"role": msg["role"], "content": str(raw_content or "")}
            )
    return result
