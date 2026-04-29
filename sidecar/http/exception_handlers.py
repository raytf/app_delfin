"""Global FastAPI exception handlers for HTTP controllers."""

from __future__ import annotations

from datetime import datetime, timezone
from http import HTTPStatus

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse

from sidecar.shared.exceptions import (
    BadRequestException,
    ConflictException,
    DomainException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
)


def register_exception_handlers(app: FastAPI) -> None:
    """Register application-wide exception handlers."""

    @app.exception_handler(DomainException)
    async def handle_domain_exception(_: Request, exc: DomainException) -> JSONResponse:
        status_code = _get_status_code_for_domain_exception(exc)
        return JSONResponse(
            status_code=status_code,
            content=_build_error_body(
                status_code=status_code,
                display_message=exc.message,
                log_message=exc.detail,
            ),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(_: Request, exc: HTTPException) -> JSONResponse:
        message = _get_http_exception_message(exc)
        return JSONResponse(
            status_code=exc.status_code,
            content=_build_error_body(
                status_code=exc.status_code,
                display_message=message,
                log_message=exc.detail,
            ),
        )


def _build_error_body(status_code: int, display_message: str, log_message: object | None) -> dict[str, object]:
    return {
        "data": None,
        "statusCode": status_code,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "error": {"logMessage": log_message, "displayMessage": display_message},
    }


def _get_http_exception_message(exception: HTTPException) -> str:
    if isinstance(exception.detail, str):
        return exception.detail
    try:
        return HTTPStatus(exception.status_code).phrase
    except ValueError:
        return "HTTP error"


def _get_status_code_for_domain_exception(exception: DomainException) -> int:
    if isinstance(exception, ConflictException):
        return status.HTTP_409_CONFLICT
    if isinstance(exception, ForbiddenException):
        return status.HTTP_403_FORBIDDEN
    if isinstance(exception, UnauthorizedException):
        return status.HTTP_401_UNAUTHORIZED
    if isinstance(exception, NotFoundException):
        return status.HTTP_404_NOT_FOUND
    if isinstance(exception, BadRequestException):
        return status.HTTP_400_BAD_REQUEST
    return status.HTTP_500_INTERNAL_SERVER_ERROR
