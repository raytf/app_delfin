"""Validation model for session creation requests."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic import field_validator

from sidecar.shared.prompts.presets import PRESETS


class CreateSessionValidation(BaseModel):
    """Validates create-session request payloads."""

    model_config = ConfigDict(str_strip_whitespace=True)

    session_name: str = Field(..., min_length=1)
    preset_id: str = Field(..., min_length=1)

    @field_validator("preset_id")
    @classmethod
    def validate_preset_id(cls, value: str) -> str:
        """Ensure the requested preset id exists."""
        if value not in PRESETS:
            raise ValueError(f"Unsupported preset_id: {value}")
        return value
