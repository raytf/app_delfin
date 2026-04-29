"""Not found domain exception."""

from __future__ import annotations

from sidecar.shared.exceptions.domain_exception import DomainException


class NotFoundException(DomainException):
    """Raised when a domain resource does not exist."""

