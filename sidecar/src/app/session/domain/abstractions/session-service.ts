import type { SessionAggregate } from '../aggregates/session-aggregate';
import type { CreateSessionDto } from '../dtos/create-session-dto';
import type { CreateSessionMessageDto } from '../dtos/create-session-message-dto';
import type { UpdateSessionDto } from '../dtos/update-session-dto';
import type { Session } from '../entities/session';
import type { SessionMessage } from '../entities/session-message';

export interface SessionService {
  create(sessionDto: CreateSessionDto): Promise<Session>;
  get(): Promise<Session[]>;
  getOneById(sessionId: string): Promise<SessionAggregate>;
  updateById(sessionId: string, updateDto: UpdateSessionDto): Promise<Session>;
  endById(sessionId: string): Promise<Session>;
  deleteById(sessionId: string): Promise<void>;
  createSessionMessage(sessionId: string, dto: CreateSessionMessageDto): Promise<SessionMessage>;
  replaceMessage(sessionId: string, messageId: string, message: SessionMessage): Promise<SessionMessage>;
}
