import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ChatMessage, SessionListItem } from '../../shared/types'

interface SessionStoreState {
  errorMessage: string | null
  isSubmitting: boolean
  messages: ChatMessage[]
  sessionHistory: SessionListItem[]
  activeAssistantMessageId: string | null
  vadListeningEnabled: boolean
  minimizedResponseMessageId: string | null
  sessionStartTime: number | null
  clearConversation: () => void
  clearLatestResponse: () => void
  startSession: () => void
  beginPromptSubmission: (input: { messageId: string; prompt: string }) => void
  beginVoiceTurn: (input: { messageId: string }) => void
  appendAssistantText: (text: string) => void
  finishAssistantResponse: () => void
  failAssistantResponse: (message: string) => void
  setSessionHistory: (sessions: SessionListItem[]) => void
  toggleVadListening: () => void
  setUserMessageImagePath: (input: { imagePath: string; messageId: string }) => void
}

function createMessageId(): string {
  return crypto.randomUUID()
}

export const useSessionStore = create<SessionStoreState>()(
  persist(
    (set) => ({
      errorMessage: null,
      isSubmitting: false,
      messages: [],
      sessionHistory: [],
      activeAssistantMessageId: null,
      vadListeningEnabled: true,
      minimizedResponseMessageId: null,
      sessionStartTime: null,

      clearConversation: () =>
        set((state) => ({
          errorMessage: null,
          isSubmitting: false,
          messages: [],
          sessionHistory: state.sessionHistory,
          activeAssistantMessageId: null,
          vadListeningEnabled: state.vadListeningEnabled,
          minimizedResponseMessageId: null,
          sessionStartTime: null,
        })),

      clearLatestResponse: () =>
        set({
          minimizedResponseMessageId: null,
        }),

      startSession: () =>
        set((state) => ({
          ...state,
          sessionStartTime: state.sessionStartTime ?? Date.now(),
        })),

      beginPromptSubmission: (input: { messageId: string; prompt: string }) =>
        set((state) => {
          const userMessage: ChatMessage = {
            id: input.messageId,
            role: 'user',
            content: input.prompt,
            timestamp: Date.now(),
          }

          const assistantMessageId = createMessageId()
          const assistantMessage: ChatMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          }

          return {
            errorMessage: null,
            isSubmitting: true,
            messages: [...state.messages, userMessage, assistantMessage],
            activeAssistantMessageId: assistantMessageId,
            minimizedResponseMessageId: assistantMessageId,
          }
        }),

      beginVoiceTurn: (input: { messageId: string }) =>
        set((state) => {
          const userMessage: ChatMessage = {
            id: input.messageId,
            role: 'user',
            content: '🎙️ Voice input',
            timestamp: Date.now(),
            isVoiceTurn: true,
          }

          const assistantMessageId = createMessageId()
          const assistantMessage: ChatMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          }

          return {
            errorMessage: null,
            isSubmitting: true,
            messages: [...state.messages, userMessage, assistantMessage],
            activeAssistantMessageId: assistantMessageId,
            minimizedResponseMessageId: assistantMessageId,
          }
        }),

      appendAssistantText: (text: string) =>
        set((state) => {
          if (state.activeAssistantMessageId === null) {
            return state
          }

          return {
            messages: state.messages.map((message) =>
              message.id === state.activeAssistantMessageId
                ? { ...message, content: message.content + text }
                : message,
            ),
          }
        }),

      finishAssistantResponse: () =>
        set({
          isSubmitting: false,
          activeAssistantMessageId: null,
        }),

      failAssistantResponse: (message: string) =>
        set((state) => {
          const messages =
            state.activeAssistantMessageId === null
              ? state.messages
              : state.messages.map((entry) =>
                entry.id === state.activeAssistantMessageId
                  ? {
                    ...entry,
                    content: message,
                  }
                  : entry,
              )

          return {
            errorMessage: message,
            isSubmitting: false,
            messages,
            activeAssistantMessageId: null,
            minimizedResponseMessageId: state.activeAssistantMessageId,
          }
        }),

      setSessionHistory: (sessions: SessionListItem[]) =>
        set({
          sessionHistory: sessions,
        }),

      toggleVadListening: () =>
        set((state) => ({
          vadListeningEnabled: !state.vadListeningEnabled,
        })),

      setUserMessageImagePath: (input: { imagePath: string; messageId: string }) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === input.messageId
              ? {
                ...message,
                imagePath: input.imagePath,
              }
              : message,
          ),
        })),
    }),
    {
      name: 'screen-copilot-active-session',
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
    },
  ),
)