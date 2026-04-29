"""Base domain exception types shared across sidecar modules."""

from __future__ import annotations


class DomainException(Exception):
    """Base exception for domain-level failures."""

    def __init__(self, message: str, detail: object | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail
