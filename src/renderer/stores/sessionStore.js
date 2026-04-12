import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { VOICE_TURN_TEXT } from '../../shared/constants';
function createMessageId() {
    return crypto.randomUUID();
}
export const useSessionStore = create()(persist((set) => ({
    errorMessage: null,
    isSubmitting: false,
    messages: [],
    sessionHistory: [],
    activeAssistantMessageId: null,
    vadListeningEnabled: true,
    minimizedResponseMessageId: null,
    sessionStartTime: null,
    clearConversation: () => set((state) => ({
        errorMessage: null,
        isSubmitting: false,
        messages: [],
        sessionHistory: state.sessionHistory,
        activeAssistantMessageId: null,
        vadListeningEnabled: state.vadListeningEnabled,
        minimizedResponseMessageId: null,
        sessionStartTime: null,
    })),
    clearLatestResponse: () => set({
        minimizedResponseMessageId: null,
    }),
    startSession: () => set((state) => ({
        ...state,
        sessionStartTime: state.sessionStartTime ?? Date.now(),
    })),
    beginPromptSubmission: (input) => set((state) => {
        const userMessage = {
            id: input.messageId,
            role: 'user',
            content: input.prompt,
            timestamp: Date.now(),
        };
        const assistantMessageId = createMessageId();
        const assistantMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        };
        return {
            errorMessage: null,
            isSubmitting: true,
            messages: [...state.messages, userMessage, assistantMessage],
            activeAssistantMessageId: assistantMessageId,
            minimizedResponseMessageId: assistantMessageId,
        };
    }),
    beginVoiceTurn: (input) => set((state) => {
        const userMessage = {
            id: input.messageId,
            role: 'user',
            content: VOICE_TURN_TEXT,
            timestamp: Date.now(),
            isVoiceTurn: true,
        };
        const assistantMessageId = createMessageId();
        const assistantMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        };
        return {
            errorMessage: null,
            isSubmitting: true,
            messages: [...state.messages, userMessage, assistantMessage],
            activeAssistantMessageId: assistantMessageId,
            minimizedResponseMessageId: assistantMessageId,
        };
    }),
    appendAssistantText: (text) => set((state) => {
        if (state.activeAssistantMessageId === null) {
            return state;
        }
        return {
            messages: state.messages.map((message) => message.id === state.activeAssistantMessageId
                ? { ...message, content: message.content + text }
                : message),
        };
    }),
    finishAssistantResponse: () => set({
        isSubmitting: false,
        activeAssistantMessageId: null,
    }),
    failAssistantResponse: (message) => set((state) => {
        const messages = state.activeAssistantMessageId === null
            ? state.messages
            : state.messages.map((entry) => entry.id === state.activeAssistantMessageId
                ? {
                    ...entry,
                    content: message,
                }
                : entry);
        return {
            errorMessage: message,
            isSubmitting: false,
            messages,
            activeAssistantMessageId: null,
            minimizedResponseMessageId: state.activeAssistantMessageId,
        };
    }),
    removeSessionHistoryItem: (sessionId) => set((state) => ({
        sessionHistory: state.sessionHistory.filter((session) => session.id !== sessionId),
    })),
    setSessionHistory: (sessions) => set({
        sessionHistory: sessions,
    }),
    toggleVadListening: () => set((state) => ({
        vadListeningEnabled: !state.vadListeningEnabled,
    })),
    setUserMessageImagePath: (input) => set((state) => ({
        messages: state.messages.map((message) => message.id === input.messageId
            ? {
                ...message,
                imagePath: input.imagePath,
            }
            : message),
    })),
}), {
    name: 'delfin-active-session',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
        errorMessage: state.errorMessage,
        isSubmitting: state.isSubmitting,
        messages: state.messages,
        sessionHistory: state.sessionHistory,
        activeAssistantMessageId: state.activeAssistantMessageId,
        vadListeningEnabled: state.vadListeningEnabled,
        minimizedResponseMessageId: state.minimizedResponseMessageId,
        sessionStartTime: state.sessionStartTime,
    }),
}));
