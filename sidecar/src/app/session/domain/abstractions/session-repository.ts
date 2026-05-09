import type { Session } from '../entities/session';
import type { SessionMessage } from '../entities/session-message';
import type { Nullable } from '../../../../shared/types/object';

export interface SessionRepository {
  create(session: Session): Promise<Session>;
  get(): Promise<Session[]>;
  getOneById(sessionId: string): Promise<Nullable<Session>>;
  updateById(sessionId: string, session: Session): Promise<Nullable<Session>>;
  deleteById(sessionId: string): Promise<void>;
  createSessionMessage(sessionId: string, message: SessionMessage): Promise<void>;
  replaceSessionMessage(sessionId: string, messageId: string, message: SessionMessage): Promise<void>;
  getSessionMessages(sessionId: string): Promise<SessionMessage[]>;
  persistMedia(
    sessionId: string,
    messageId: string,
    input?: {
      imageBase64?: string;
      audioBase64?: string;
    },
  ): Promise<{
    imagePath: Nullable<string>;
    audioPath: Nullable<string>;
  }>;
}
