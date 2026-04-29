"""Forbidden domain exception."""

from __future__ import annotations

from sidecar.shared.exceptions.domain_exception import DomainException


class ForbiddenException(DomainException):
    """Raised when access is forbidden."""

