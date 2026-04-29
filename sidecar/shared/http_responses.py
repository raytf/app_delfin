"""Shared HTTP response envelope models."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class HttpResponseError(BaseModel):
    """Structured HTTP error details."""

    logMessage: object | None = None
    displayMessage: str | None = None


class HttpSuccessResponse(BaseModel, Generic[T]):
    """Structured HTTP success envelope."""

    data: T
    message: str = "Success"
    statusCode: int
    timestamp: datetime


class HttpErrorResponse(BaseModel):
    """Structured HTTP error envelope."""

    data: None = None
    statusCode: int
    timestamp: datetime
    error: HttpResponseError


def build_success_response(
    data: T,
    message: str = "Success",
    status_code: int = 200,
) -> HttpSuccessResponse[T]:
    """Build a standardized HTTP success response."""

    return HttpSuccessResponse[T](
        data=data,
        message=message,
        statusCode=status_code,
        timestamp=datetime.now(timezone.utc),
    )
