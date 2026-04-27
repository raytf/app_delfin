"""Validation model for session update requests."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UpdateSessionValidation(BaseModel):
    """Validates update-session request payloads."""

    model_config = ConfigDict(str_strip_whitespace=True)

    session_name: str | None = Field(default=None, min_length=1)
