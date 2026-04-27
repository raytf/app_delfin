"""DTO for session updates."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class UpdateSessionDto:
    session_name: str | None = None
