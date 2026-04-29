"""Unauthorized domain exception."""

from __future__ import annotations

from sidecar.shared.exceptions.domain_exception import DomainException


class UnauthorizedException(DomainException):
    """Raised when authentication is required or invalid."""

