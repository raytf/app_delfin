"""Conflict domain exception."""

from __future__ import annotations

from sidecar.shared.exceptions.domain_exception import DomainException


class ConflictException(DomainException):
    """Raised when a domain conflict prevents the requested operation."""

