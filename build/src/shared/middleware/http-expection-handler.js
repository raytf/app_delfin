import { ZodError } from 'zod';
import { BadRequestException, ConflictException, DomainException, ForbiddenException, NotFoundException, UnauthorizedException, } from '../exceptions';
import errorMessage from '../constants/messages/error-message';
import { getCurrentUTCDate } from '../utils/date';
export const httpExpectionHandler = (err, _req, res, _next) => {
    const timestamp = getCurrentUTCDate();
    if (err instanceof DomainException) {
        const statusCode = mapDomainExceptionToStatusCode(err);
        const responseBody = {
            data: null,
            statusCode,
            timestamp,
            error: {
                logMessage: err.detail,
                displayMessage: err.message,
            },
        };
        res.status(statusCode).json(responseBody);
        return;
    }
    if (err instanceof ZodError) {
        const responseBody = {
            data: null,
            statusCode: 400,
            timestamp,
            error: {
                logMessage: err.format(),
                displayMessage: err.issues[0]?.message ?? errorMessage.VALIDATION_FAILED,
            },
        };
        res.status(400).json(responseBody);
        return;
    }
    if (err instanceof Error) {
        const responseBody = {
            data: null,
            statusCode: 500,
            timestamp,
            error: {
                logMessage: err.stack ?? err.message,
                displayMessage: errorMessage.DEFAULT_ERROR,
            },
        };
        res.status(500).json(responseBody);
        return;
    }
    const responseBody = {
        data: null,
        statusCode: 500,
        timestamp,
        error: {
            logMessage: String(err),
            displayMessage: errorMessage.DEFAULT_ERROR,
        },
    };
    res.status(500).json(responseBody);
};
const mapDomainExceptionToStatusCode = (error) => {
    if (error instanceof ConflictException) {
        return 409;
    }
    if (error instanceof ForbiddenException) {
        return 403;
    }
    if (error instanceof UnauthorizedException) {
        return 401;
    }
    if (error instanceof NotFoundException) {
        return 404;
    }
    if (error instanceof BadRequestException) {
        return 400;
    }
    return 500;
};
