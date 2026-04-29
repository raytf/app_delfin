"""Bad request domain exception."""

from __future__ import annotations

from sidecar.shared.exceptions.domain_exception import DomainException


class BadRequestException(DomainException):
    """Raised when a request is invalid for domain reasons."""

