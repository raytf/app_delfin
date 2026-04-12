import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
export class FileSessionStorage {
    baseDir;
    capturesDir;
    sessionsDir;
    indexPath;
    pendingWrite = Promise.resolve();
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.capturesDir = join(baseDir, "captures");
        this.sessionsDir = join(baseDir, "sessions");
        this.indexPath = join(this.sessionsDir, "index.json");
    }
    async createSession(record) {
        await this.enqueueWrite(async () => {
            const sessions = await this.readSessionIndex();
            sessions.push(record);
            await this.writeSessionIndex(sessions);
            await this.writeConversation(record.id, []);
        });
    }
    async updateSession(sessionId, updates) {
        await this.enqueueWrite(async () => {
            const sessions = await this.readSessionIndex();
            const sessionIndex = sessions.findIndex((session) => session.id === sessionId);
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
    async deleteSession(sessionId) {
        await this.enqueueWrite(async () => {
            const sessions = await this.readSessionIndex();
            const nextSessions = sessions.filter((session) => session.id !== sessionId);
            if (nextSessions.length === sessions.length) {
                throw new Error(`Cannot delete missing session: ${sessionId}`);
            }
            await this.writeSessionIndex(nextSessions);
            await rm(this.getConversationPath(sessionId), { force: true });
            await rm(this.getCaptureDirectoryPath(sessionId), {
                force: true,
                recursive: true,
            });
        });
    }
    async appendConversationMessage(message) {
        await this.enqueueWrite(async () => {
            const conversation = await this.readConversation(message.sessionId);
            conversation.push(message);
            await this.writeConversation(message.sessionId, conversation);
        });
    }
    async replaceConversationMessage(messageId, message) {
        await this.enqueueWrite(async () => {
            const conversation = await this.readConversation(message.sessionId);
            const messageIndex = conversation.findIndex((entry) => entry.id === messageId);
            if (messageIndex === -1) {
                throw new Error(`Cannot replace missing conversation message: ${messageId}`);
            }
            conversation[messageIndex] = message;
            await this.writeConversation(message.sessionId, conversation);
        });
    }
    async getSession(sessionId) {
        const sessions = await this.readSessionIndex();
        return sessions.find((session) => session.id === sessionId) ?? null;
    }
    async getConversation(sessionId) {
        return this.readConversation(sessionId);
    }
    async listSessions() {
        const sessions = await this.readSessionIndex();
        return [...sessions].sort((left, right) => right.startedAt - left.startedAt);
    }
    async persistCaptureImage(input) {
        const relativePath = join(this.capturesDir, input.sessionId, `${input.messageId}.jpg`);
        const absolutePath = this.resolveStoragePath(relativePath);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, Buffer.from(input.imageBase64, "base64"));
        return relativePath;
    }
    async getCaptureImageDataUrl(relativePath) {
        const absolutePath = this.resolveStoragePath(relativePath);
        const image = await readFile(absolutePath);
        return `data:image/jpeg;base64,${image.toString("base64")}`;
    }
    enqueueWrite(operation) {
        const nextWrite = this.pendingWrite.then(operation);
        this.pendingWrite = nextWrite.catch(() => undefined);
        return nextWrite;
    }
    async readSessionIndex() {
        return this.readJsonFile(this.indexPath, []);
    }
    async writeSessionIndex(sessions) {
        await this.writeJsonFile(this.indexPath, sessions);
    }
    async readConversation(sessionId) {
        return this.readJsonFile(this.getConversationPath(sessionId), []);
    }
    async writeConversation(sessionId, conversation) {
        await this.writeJsonFile(this.getConversationPath(sessionId), conversation);
    }
    getConversationPath(sessionId) {
        return join(this.sessionsDir, `${sessionId}.json`);
    }
    getCaptureDirectoryPath(sessionId) {
        return join(this.capturesDir, sessionId);
    }
    resolveStoragePath(relativePath) {
        const absolutePath = resolve(this.baseDir, relativePath);
        if (!absolutePath.startsWith(resolve(this.baseDir))) {
            throw new Error(`Invalid storage path: ${relativePath}`);
        }
        return absolutePath;
    }
    async readJsonFile(filePath, fallback) {
        try {
            const contents = await readFile(filePath, "utf8");
            return JSON.parse(contents);
        }
        catch (error) {
            if (this.isMissingFileError(error)) {
                return fallback;
            }
            throw error;
        }
    }
    async writeJsonFile(filePath, value) {
        await mkdir(dirname(filePath), { recursive: true });
        const tempFilePath = `${filePath}.tmp`;
        const contents = `${JSON.stringify(value, null, 2)}\n`;
        await writeFile(tempFilePath, contents, "utf8");
        await rename(tempFilePath, filePath);
    }
    isMissingFileError(error) {
        return error instanceof Error && "code" in error && error.code === "ENOENT";
    }
}
