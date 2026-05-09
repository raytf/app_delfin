import type { SessionAggregate } from '../aggregates/session-aggregate';
import type { SessionRepository } from '../abstractions/session-repository';
import type { SessionService } from '../abstractions/session-service';
import type { CreateSessionDto } from '../dtos/create-session-dto';
import type { UpdateSessionDto } from '../dtos/update-session-dto';
import { Session } from '../entities/session';
import { SessionAggregate as SessionAggregateClass } from '../aggregates/session-aggregate';
import { NotFoundException } from '../../../../shared/exceptions/not-found-exception';

export class SessionServiceImpl implements SessionService {
  constructor(private readonly sessionRepository: SessionRepository) {}

  async create(sessionDto: CreateSessionDto): Promise<Session> {
    const session = new Session({
      name: sessionDto.sessionName,
      presetId: sessionDto.presetId,
    });
    return this.sessionRepository.create(session);
  }

  async get(): Promise<Session[]> {
    return this.sessionRepository.get();
  }

  async getOneById(sessionId: string): Promise<SessionAggregate> {
    const session = await this.sessionRepository.getOneById(sessionId);
    if (session === null) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    const messages = await this.sessionRepository.getSessionMessages(sessionId);
    return new SessionAggregateClass(session, messages);
  }

  async updateById(sessionId: string, updateDto: UpdateSessionDto): Promise<Session> {
    const aggregate = await this.getOneById(sessionId);
    if (updateDto.sessionName !== undefined) {
      aggregate.name = updateDto.sessionName;
      aggregate.touch();
    }
    const updated = await this.sessionRepository.updateById(sessionId, aggregate);
    if (updated === null) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    return updated;
  }

  async endById(sessionId: string): Promise<Session> {
    const aggregate = await this.getOneById(sessionId);
    aggregate.end();
    const updated = await this.sessionRepository.updateById(sessionId, aggregate);
    if (updated === null) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    return updated;
  }

  async deleteById(sessionId: string): Promise<void> {
    await this.sessionRepository.deleteById(sessionId);
  }
}
