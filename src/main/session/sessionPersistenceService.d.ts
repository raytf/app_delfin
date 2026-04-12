import type { PresetId, SessionDetail } from '../../shared/types';
import type { PersistedSessionStatus, SessionRecord, SessionStorage } from '../storage/types';
type FinalSessionStatus = Exclude<PersistedSessionStatus, 'active'>;
export declare class SessionPersistenceService {
    private readonly storage;
    private activeSessionId;
    private activeAssistantDraft;
    private messageCount;
    private pendingFinalStatus;
    constructor(storage: SessionStorage);
    startSession(sessionName: string): Promise<string>;
    recordUserPrompt(input: {
        imageBase64: string;
        messageId: string;
        text: string;
        presetId: PresetId;
        sourceLabel: string | null;
    }): Promise<string>;
    appendAssistantToken(text: string): Promise<void>;
    failAssistantResponse(message: string): Promise<void>;
    finishAssistantResponse(): Promise<void>;
    stopSession(status?: FinalSessionStatus): Promise<void>;
    listSessions(): Promise<SessionRecord[]>;
    getSessionDetail(sessionId: string): Promise<SessionDetail>;
    getCaptureImageDataUrl(relativePath: string): Promise<string>;
    deleteSession(sessionId: string): Promise<void>;
    private persistAssistantDraft;
    private requireActiveSessionId;
}
export {};
