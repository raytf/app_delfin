import type { NextFunction, Request, Response } from 'express';
import type { ParsedQs } from 'qs';
import type { ZodSchema } from 'zod';

type RequestSchema = {
  body?: ZodSchema;
  query?: ZodSchema;
};

export const validateHttpRequest = (schema: RequestSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      if (schema.query) {
        req.query = schema.query.parse(req.query) as ParsedQs;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
