import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  ConversationMessageRecord,
  PersistCaptureImageInput,
  SessionRecord,
  SessionStorage,
} from "./types";

export class FileSessionStorage implements SessionStorage {
  private readonly capturesDir: string;
  private readonly sessionsDir: string;
  private readonly indexPath: string;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(readonly baseDir: string) {
    this.capturesDir = join(baseDir, "captures");
    this.sessionsDir = join(baseDir, "sessions");
    this.indexPath = join(this.sessionsDir, "index.json");
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.enqueueWrite(async () => {
      const sessions = await this.readSessionIndex();
      sessions.push(record);
      await this.writeSessionIndex(sessions);
      await this.writeConversation(record.id, []);
    });
  }

  async updateSession(
    sessionId: string,
    updates: Partial<SessionRecord>,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const sessions = await this.readSessionIndex();
      const sessionIndex = sessions.findIndex(
        (session) => session.id === sessionId,
      );

      if (sessionIndex === -1) {
        throw new Error(`Cannot update missing session: ${sessionId}`);
      }

      sessions[sessionIndex] = {
        ...sessions[sessionIndex],
        ...updates,
      };
      await this.writeSessionIndex(sessions);
    });
  }

  async appendConversationMessage(
    message: ConversationMessageRecord,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const conversation = await this.readConversation(message.sessionId);
      conversation.push(message);
      await this.writeConversation(message.sessionId, conversation);
    });
  }

  async replaceConversationMessage(
    messageId: string,
    message: ConversationMessageRecord,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const conversation = await this.readConversation(message.sessionId);
      const messageIndex = conversation.findIndex(
        (entry) => entry.id === messageId,
      );

      if (messageIndex === -1) {
        throw new Error(
          `Cannot replace missing conversation message: ${messageId}`,
        );
      }

      conversation[messageIndex] = message;
      await this.writeConversation(message.sessionId, conversation);
    });
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const sessions = await this.readSessionIndex();
    return sessions.find((session) => session.id === sessionId) ?? null;
  }

  async getConversation(
    sessionId: string,
  ): Promise<ConversationMessageRecord[]> {
    return this.readConversation(sessionId);
  }

  async listSessions(): Promise<SessionRecord[]> {
    const sessions = await this.readSessionIndex();
    return [...sessions].sort(
      (left, right) => right.startedAt - left.startedAt,
    );
  }

  async persistCaptureImage(input: PersistCaptureImageInput): Promise<string> {
    const relativePath = join(
      this.capturesDir,
      input.sessionId,
      `${input.messageId}.jpg`,
    );
    const absolutePath = this.resolveStoragePath(relativePath);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(input.imageBase64, "base64"));

    return relativePath;
  }

  async getCaptureImageDataUrl(relativePath: string): Promise<string> {
    const absolutePath = this.resolveStoragePath(relativePath);
    const image = await readFile(absolutePath);
    return `data:image/jpeg;base64,${image.toString("base64")}`;
  }

  private enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const nextWrite = this.pendingWrite.then(operation);
    this.pendingWrite = nextWrite.catch(() => undefined);
    return nextWrite;
  }

  private async readSessionIndex(): Promise<SessionRecord[]> {
    return this.readJsonFile<SessionRecord[]>(this.indexPath, []);
  }

  private async writeSessionIndex(sessions: SessionRecord[]): Promise<void> {
    await this.writeJsonFile(this.indexPath, sessions);
  }

  private async readConversation(
    sessionId: string,
  ): Promise<ConversationMessageRecord[]> {
    return this.readJsonFile<ConversationMessageRecord[]>(
      this.getConversationPath(sessionId),
      [],
    );
  }

  private async writeConversation(
    sessionId: string,
    conversation: ConversationMessageRecord[],
  ): Promise<void> {
    await this.writeJsonFile(this.getConversationPath(sessionId), conversation);
  }

  private getConversationPath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.json`);
  }

  private resolveStoragePath(relativePath: string): string {
    const absolutePath = resolve(this.baseDir, relativePath);

    if (!absolutePath.startsWith(resolve(this.baseDir))) {
      throw new Error(`Invalid storage path: ${relativePath}`);
    }

    return absolutePath;
  }

  private async readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const contents = await readFile(filePath, "utf8");
      return JSON.parse(contents) as T;
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return fallback;
      }

      throw error;
    }
  }

  private async writeJsonFile(filePath: string, value: unknown): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });

    const tempFilePath = `${filePath}.tmp`;
    const contents = `${JSON.stringify(value, null, 2)}\n`;

    await writeFile(tempFilePath, contents, "utf8");
    await rename(tempFilePath, filePath);
  }

  private isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}
