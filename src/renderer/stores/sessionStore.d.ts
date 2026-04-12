import type { ChatMessage, SessionListItem } from '../../shared/types';
interface SessionStoreState {
    errorMessage: string | null;
    isSubmitting: boolean;
    messages: ChatMessage[];
    sessionHistory: SessionListItem[];
    activeAssistantMessageId: string | null;
    vadListeningEnabled: boolean;
    minimizedResponseMessageId: string | null;
    sessionStartTime: number | null;
    clearConversation: () => void;
    clearLatestResponse: () => void;
    startSession: () => void;
    beginPromptSubmission: (input: {
        messageId: string;
        prompt: string;
    }) => void;
    beginVoiceTurn: (input: {
        messageId: string;
    }) => void;
    appendAssistantText: (text: string) => void;
    finishAssistantResponse: () => void;
    failAssistantResponse: (message: string) => void;
    removeSessionHistoryItem: (sessionId: string) => void;
    setSessionHistory: (sessions: SessionListItem[]) => void;
    toggleVadListening: () => void;
    setUserMessageImagePath: (input: {
        imagePath: string;
        messageId: string;
    }) => void;
}
export declare const useSessionStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<SessionStoreState>, "setState" | "persist"> & {
    setState(partial: SessionStoreState | Partial<SessionStoreState> | ((state: SessionStoreState) => SessionStoreState | Partial<SessionStoreState>), replace?: false | undefined): unknown;
    setState(state: SessionStoreState | ((state: SessionStoreState) => SessionStoreState), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<SessionStoreState, unknown, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: SessionStoreState) => void) => () => void;
        onFinishHydration: (fn: (state: SessionStoreState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<SessionStoreState, unknown, unknown>>;
    };
}>;
export {};
