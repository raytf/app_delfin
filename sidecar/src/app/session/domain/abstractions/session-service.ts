import type { SessionAggregate } from '../aggregates/session-aggregate';
import type { CreateSessionDto } from '../dtos/create-session-dto';
import type { UpdateSessionDto } from '../dtos/update-session-dto';
import type { Session } from '../entities/session';

export interface SessionService {
  create(sessionDto: CreateSessionDto): Promise<Session>;
  get(): Promise<Session[]>;
  getOneById(sessionId: string): Promise<SessionAggregate>;
  updateById(sessionId: string, updateDto: UpdateSessionDto): Promise<Session>;
  endById(sessionId: string): Promise<Session>;
  deleteById(sessionId: string): Promise<void>;
}
