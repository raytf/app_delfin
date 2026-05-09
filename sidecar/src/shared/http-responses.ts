import type { Response } from 'express';
import { getCurrentUTCDate } from './utils/date';

export type HttpResponseError = {
  key?: string;
  logMessage?: unknown;
  displayMessage?: string;
};

export type HttpResponseBody<T = unknown> = {
  data: T | null;
  message?: string;
  error?: HttpResponseError;
  statusCode?: number;
  timestamp?: Date;
};

export const buildSuccessResponse = <T>(data: T, message = 'Success', statusCode = 200): HttpResponseBody<T> => ({
  data,
  message,
  statusCode,
  timestamp: getCurrentUTCDate(),
});

export const sendSuccessResponse = <T>(
  response: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
): Response<HttpResponseBody<T>> => {
  const responseBody = buildSuccessResponse(data, message, statusCode);
  return response.status(statusCode).json(responseBody);
};
