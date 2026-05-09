import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { SessionRepository } from '../domain/abstractions/session-repository';
import { Session } from '../domain/entities/session';
import type { SessionMessage } from '../domain/entities/session-message';
import type { Nullable } from '../../../shared/types/object';

type SessionRecord = {
  id: string;
  name: string;
  preset_id: string;
  started_at: number;
  ended_at: number | null;
  status: 'active' | 'ended';
  message_count: number;
  updated_at: number;
  messages: Array<{
    id: string;
    session_id: string;
    author: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    image_path: string | null;
    audio_path: string | null;
    error_message: string | null;
    interrupted: boolean;
  }>;
};

export class FileSessionRepository implements SessionRepository {
  constructor(private readonly storageRoot: string) {}

  async create(session: Session): Promise<Session> {
    await this.ensureStorage();
    const record = this.toRecord(session, []);
    await this.writeSessionRecord(record);
    return session;
  }

  async get(): Promise<Session[]> {
    await this.ensureStorage();
    const files = await readdir(this.storageRoot);
    const jsonFiles = files.filter((file) => file.endsWith('.json')).sort();
    const sessions: Session[] = [];
    for (const file of jsonFiles) {
      const record = await this.readSessionRecordByPath(join(this.storageRoot, file));
      sessions.push(this.toEntity(record));
    }
    return sessions;
  }

  async getOneById(sessionId: string): Promise<Nullable<Session>> {
    const record = await this.tryReadSessionRecord(sessionId);
    return record ? this.toEntity(record) : null;
  }

  async updateById(sessionId: string, session: Session): Promise<Nullable<Session>> {
    const existing = await this.tryReadSessionRecord(sessionId);
    if (existing === null) {
      return null;
    }
    const nextRecord = this.toRecord(session, existing.messages);
    await this.writeSessionRecord(nextRecord);
    return session;
  }

  async deleteById(sessionId: string): Promise<void> {
    const filePath = this.sessionFilePath(sessionId);
    try {
      await unlink(filePath);
    } catch {
      return;
    }
  }

  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    const record = await this.tryReadSessionRecord(sessionId);
    if (record === null) {
      return [];
    }
    return record.messages.map((message) => ({
      id: message.id,
      sessionId: message.session_id,
      author: message.author,
      content: message.content,
      timestamp: message.timestamp,
      imagePath: message.image_path,
      audioPath: message.audio_path,
      errorMessage: message.error_message,
      interrupted: message.interrupted,
    }));
  }

  private sessionFilePath(sessionId: string): string {
    return join(this.storageRoot, `${sessionId}.json`);
  }

  private async ensureStorage(): Promise<void> {
    await mkdir(this.storageRoot, { recursive: true });
  }

  private async tryReadSessionRecord(sessionId: string): Promise<Nullable<SessionRecord>> {
    const filePath = this.sessionFilePath(sessionId);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        return null;
      }
      return this.readSessionRecordByPath(filePath);
    } catch {
      return null;
    }
  }

  private async readSessionRecordByPath(filePath: string): Promise<SessionRecord> {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as SessionRecord;
    return parsed;
  }

  private async writeSessionRecord(record: SessionRecord): Promise<void> {
    const filePath = this.sessionFilePath(record.id);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
  }

  private toRecord(session: Session, messages: SessionRecord['messages']): SessionRecord {
    return {
      id: session.id,
      name: session.name,
      preset_id: session.presetId,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      status: session.status,
      message_count: session.messageCount,
      updated_at: session.updatedAt,
      messages,
    };
  }

  private toEntity(record: SessionRecord): Session {
    const entity = new Session({
      name: record.name,
      presetId: record.preset_id,
    });
    entity.id = record.id;
    entity.startedAt = record.started_at;
    entity.endedAt = record.ended_at;
    entity.status = record.status;
    entity.messageCount = record.message_count;
    entity.updatedAt = record.updated_at;
    return entity;
  }
}
