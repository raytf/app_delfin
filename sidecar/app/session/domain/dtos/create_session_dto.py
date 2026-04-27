"""DTO for session creation."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CreateSessionDto:
    session_name: str
