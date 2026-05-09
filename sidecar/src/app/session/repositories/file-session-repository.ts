import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { SessionRepository } from '../domain/abstractions/session-repository';
import { Session } from '../domain/entities/session';
import { SessionMessage } from '../domain/entities/session-message';
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
  private readonly mediaRoot: string;

  constructor(private readonly storageRoot: string) {
    this.mediaRoot = join(this.storageRoot, '_media');
  }

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
    await rm(this.mediaDirPath(sessionId), { recursive: true, force: true });
  }

  async createSessionMessage(sessionId: string, message: SessionMessage): Promise<void> {
    const record = await this.tryReadSessionRecord(sessionId);
    if (record === null) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    record.messages.push(this.toMessageRecord(message));
    await this.writeSessionRecord(record);
  }

  async replaceSessionMessage(sessionId: string, messageId: string, message: SessionMessage): Promise<void> {
    const record = await this.tryReadSessionRecord(sessionId);
    if (record === null) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const messageIndex = record.messages.findIndex((item) => item.id === messageId);
    if (messageIndex < 0) {
      throw new Error(`Session message not found: ${messageId}`);
    }

    record.messages[messageIndex] = this.toMessageRecord(message);
    await this.writeSessionRecord(record);
  }

  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    const record = await this.tryReadSessionRecord(sessionId);
    if (record === null) {
      return [];
    }
    return record.messages.map((message) => this.toMessageEntity(message));
  }

  async persistMedia(
    sessionId: string,
    messageId: string,
    input?: {
      imageBase64?: string;
      audioBase64?: string;
    },
  ): Promise<{
    imagePath: Nullable<string>;
    audioPath: Nullable<string>;
  }> {
    const mediaDir = this.mediaDirPath(sessionId);
    await mkdir(mediaDir, { recursive: true });

    let imagePath: Nullable<string> = null;
    let audioPath: Nullable<string> = null;

    if (input?.imageBase64) {
      const imageFilePath = join(mediaDir, `${messageId}.jpg`);
      await writeFile(imageFilePath, Buffer.from(input.imageBase64, 'base64'));
      imagePath = imageFilePath;
    }

    if (input?.audioBase64) {
      const audioFilePath = join(mediaDir, `${messageId}.wav`);
      await writeFile(audioFilePath, Buffer.from(input.audioBase64, 'base64'));
      audioPath = audioFilePath;
    }

    return { imagePath, audioPath };
  }

  private sessionFilePath(sessionId: string): string {
    return join(this.storageRoot, `${sessionId}.json`);
  }

  private mediaDirPath(sessionId: string): string {
    return join(this.mediaRoot, sessionId);
  }

  private async ensureStorage(): Promise<void> {
    await mkdir(this.storageRoot, { recursive: true });
    await mkdir(this.mediaRoot, { recursive: true });
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
      started_at: this.serializeDate(session.startedAt) ?? 0,
      ended_at: this.serializeDate(session.endedAt),
      status: session.status,
      message_count: session.messageCount,
      updated_at: this.serializeDate(session.updatedAt) ?? 0,
      messages,
    };
  }

  private toEntity(record: SessionRecord): Session {
    const entity = new Session({
      name: record.name,
      presetId: record.preset_id,
    });
    entity.id = record.id;
    entity.startedAt = this.deserializeDate(record.started_at) ?? new Date(0);
    entity.endedAt = this.deserializeDate(record.ended_at);
    entity.status = record.status;
    entity.messageCount = record.message_count;
    entity.updatedAt = this.deserializeDate(record.updated_at) ?? new Date(0);
    return entity;
  }

  private toMessageRecord(message: SessionMessage): SessionRecord['messages'][number] {
    return {
      id: message.id,
      session_id: message.sessionId,
      author: message.author,
      content: message.content,
      timestamp: this.serializeDate(message.timestamp) ?? 0,
      image_path: message.imagePath,
      audio_path: message.audioPath,
      error_message: message.errorMessage,
      interrupted: message.interrupted,
    };
  }

  private toMessageEntity(message: SessionRecord['messages'][number]): SessionMessage {
    return new SessionMessage({
      id: message.id,
      sessionId: message.session_id,
      author: message.author,
      content: message.content,
      timestamp: this.deserializeDate(message.timestamp) ?? new Date(0),
      imagePath: message.image_path,
      audioPath: message.audio_path,
      errorMessage: message.error_message,
      interrupted: message.interrupted,
    });
  }

  private serializeDate(date: Nullable<Date>): Nullable<number> {
    if (date === null) {
      return null;
    }
    return date.getTime() / 1000;
  }

  private deserializeDate(value: Nullable<number>): Nullable<Date> {
    if (value === null) {
      return null;
    }
    return new Date(value * 1000);
  }
}
