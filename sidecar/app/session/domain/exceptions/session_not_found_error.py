"""Session domain exceptions."""

from __future__ import annotations


class SessionNotFoundError(Exception):
    """Raised when a requested session cannot be found."""

    pass
