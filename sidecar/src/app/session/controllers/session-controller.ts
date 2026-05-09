import type { NextFunction, Request, Response } from 'express';
import type { SessionService } from '../domain/abstractions/session-service';
import { sendSuccessResponse } from '../../../shared/http-responses';
import { getStringParam } from '../../../shared/utils/http';

export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  createSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await this.sessionService.create(req.body);
      sendSuccessResponse(res, session, 'Session created successfully', 201);
    } catch (error) {
      next(error);
    }
  };

  getSessions = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await this.sessionService.get();
      sendSuccessResponse(res, sessions, 'Sessions fetched successfully');
    } catch (error) {
      next(error);
    }
  };

  getSessionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getStringParam(req.params.sessionId);
      const session = await this.sessionService.getOneById(sessionId);
      sendSuccessResponse(res, session, 'Session fetched successfully');
    } catch (error) {
      next(error);
    }
  };

  updateSessionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getStringParam(req.params.sessionId);
      const session = await this.sessionService.updateById(sessionId, req.body);
      sendSuccessResponse(res, session, 'Session updated successfully');
    } catch (error) {
      next(error);
    }
  };

  endSessionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getStringParam(req.params.sessionId);
      const session = await this.sessionService.endById(sessionId);
      sendSuccessResponse(res, session, 'Session ended successfully');
    } catch (error) {
      next(error);
    }
  };

  deleteSessionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getStringParam(req.params.sessionId);
      await this.sessionService.deleteById(sessionId);
      sendSuccessResponse(res, null, 'Session deleted successfully');
    } catch (error) {
      next(error);
    }
  };
}
