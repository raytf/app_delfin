import { Session } from '../entities/session';
import { SessionMessage } from '../entities/session-message';
import { SessionAggregate as SessionAggregateClass } from '../aggregates/session-aggregate';
import { NotFoundException } from '../../../../shared/exceptions/not-found-exception';
export class SessionServiceImpl {
    sessionRepository;
    constructor(sessionRepository) {
        this.sessionRepository = sessionRepository;
    }
    async create(sessionDto) {
        const session = new Session({
            name: sessionDto.sessionName,
            presetId: sessionDto.presetId,
        });
        return this.sessionRepository.create(session);
    }
    async get() {
        return this.sessionRepository.get();
    }
    async getOneById(sessionId) {
        const session = await this.sessionRepository.getOneById(sessionId);
        if (session === null) {
            throw new NotFoundException(`Session not found: ${sessionId}`);
        }
        const messages = await this.sessionRepository.getSessionMessages(sessionId);
        return new SessionAggregateClass(session, messages);
    }
    async updateById(sessionId, updateDto) {
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
    async endById(sessionId) {
        const aggregate = await this.getOneById(sessionId);
        aggregate.end();
        const updated = await this.sessionRepository.updateById(sessionId, aggregate);
        if (updated === null) {
            throw new NotFoundException(`Session not found: ${sessionId}`);
        }
        return updated;
    }
    async deleteById(sessionId) {
        await this.sessionRepository.deleteById(sessionId);
    }
    async createSessionMessage(sessionId, dto) {
        const existingSession = await this.getOneById(sessionId);
        const message = new SessionMessage({
            sessionId,
            author: dto.author,
            content: dto.content,
            timestamp: dto.timestamp,
            errorMessage: dto.errorMessage,
            interrupted: dto.interrupted,
        });
        const { imagePath, audioPath } = await this.sessionRepository.persistMedia(sessionId, message.id, {
            imageBase64: dto.imageBase64,
            audioBase64: dto.audioBase64,
        });
        const persistedMessage = new SessionMessage({
            id: message.id,
            sessionId: message.sessionId,
            author: message.author,
            content: message.content,
            timestamp: message.timestamp,
            imagePath,
            audioPath,
            errorMessage: message.errorMessage,
            interrupted: message.interrupted,
        });
        await this.sessionRepository.createSessionMessage(sessionId, persistedMessage);
        existingSession.messageCount += 1;
        existingSession.touch();
        await this.sessionRepository.updateById(sessionId, existingSession);
        return persistedMessage;
    }
    async replaceMessage(sessionId, messageId, message) {
        const existingSession = await this.getOneById(sessionId);
        await this.sessionRepository.replaceSessionMessage(sessionId, messageId, message);
        existingSession.touch();
        await this.sessionRepository.updateById(sessionId, existingSession);
        return message;
    }
}
