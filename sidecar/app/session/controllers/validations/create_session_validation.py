"""Validation model for session creation requests."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CreateSessionValidation(BaseModel):
    """Validates create-session request payloads."""

    model_config = ConfigDict(str_strip_whitespace=True)

    session_name: str = Field(..., min_length=1)
