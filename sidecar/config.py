"""Application configuration for the sidecar."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() == "true"


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw not in {None, ""} else default


def _get_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    return float(raw) if raw not in {None, ""} else default


@dataclass(frozen=True)
class HttpServerConfig:
    host: str
    port: int


@dataclass(frozen=True)
class ModelConfig:
    repo: str
    file: str


@dataclass(frozen=True)
class InferenceConfig:
    backend: str
    cache_dir: str
    vision_token_budget: int
    max_image_width: int


@dataclass(frozen=True)
class TTSConfig:
    enabled: bool
    backend: str
    kokoro_voice: str
    kokoro_speed: float
    kokoro_model_path: str | None
    kokoro_voices_path: str | None


@dataclass(frozen=True)
class SidecarConfig:
    http_server: HttpServerConfig
    model: ModelConfig
    inference: InferenceConfig
    tts: TTSConfig


def load_config() -> SidecarConfig:
    """Load sidecar configuration from environment variables."""
    return SidecarConfig(
        http_server=HttpServerConfig(
            host=os.getenv("SIDECAR_HOST", "0.0.0.0"),
            port=_get_int("SIDECAR_PORT", 8321),
        ),
        model=ModelConfig(
            repo=os.getenv("MODEL_REPO", ""),
            file=os.getenv("MODEL_FILE", ""),
        ),
        inference=InferenceConfig(
            backend=os.getenv("LITERT_BACKEND", "CPU"),
            cache_dir=os.getenv("LITERT_CACHE_DIR", "/tmp/litert-cache"),
            vision_token_budget=_get_int("VISION_TOKEN_BUDGET", 280),
            max_image_width=_get_int("MAX_IMAGE_WIDTH", 512),
        ),
        tts=TTSConfig(
            enabled=_get_bool("TTS_ENABLED", False),
            backend=os.getenv("TTS_BACKEND", "web-speech"),
            kokoro_voice=os.getenv("KOKORO_VOICE", "af_heart"),
            kokoro_speed=_get_float("KOKORO_SPEED", 1.1),
            kokoro_model_path=os.getenv("KOKORO_MODEL_PATH") or None,
            kokoro_voices_path=os.getenv("KOKORO_VOICES_PATH") or None,
        ),
    )
