import { Router } from 'express';
import { SessionController } from './session-controller';
import type { SessionService } from '../domain/abstractions/session-service';
import { validateHttpRequest } from '../../../shared/middleware/validate-http-request';
import { createSessionValidationSchema } from './validations/create-session-validation';
import { updateSessionValidationSchema } from './validations/update-session-validation';

export const createSessionRoutes = (sessionService: SessionService): Router => {
  const controller = new SessionController(sessionService);
  const router = Router();

  router.post('', validateHttpRequest({ body: createSessionValidationSchema }), controller.createSession);
  router.get('', controller.getSessions);
  router.get('/:sessionId', controller.getSessionById);
  router.patch('/:sessionId', validateHttpRequest({ body: updateSessionValidationSchema }), controller.updateSessionById);
  router.patch('/:sessionId/end', controller.endSessionById);
  router.delete('/:sessionId', controller.deleteSessionById);

  return router;
};
