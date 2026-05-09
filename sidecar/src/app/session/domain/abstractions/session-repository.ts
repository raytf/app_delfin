import type { Session } from '../entities/session';
import type { SessionMessage } from '../entities/session-message';
import type { Nullable } from '../../../../shared/types/object';

export interface SessionRepository {
  create(session: Session): Promise<Session>;
  get(): Promise<Session[]>;
  getOneById(sessionId: string): Promise<Nullable<Session>>;
  updateById(sessionId: string, session: Session): Promise<Nullable<Session>>;
  deleteById(sessionId: string): Promise<void>;
  getSessionMessages(sessionId: string): Promise<SessionMessage[]>;
}
