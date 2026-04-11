import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ChatMessage, SessionListItem } from '../../shared/types'

interface SessionStoreState {
  errorMessage: string | null
  isSubmitting: boolean
  messages: ChatMessage[]
  sessionHistory: SessionListItem[]
  activeAssistantMessageId: string | null
  sessionStartTime: number | null
  clearConversation: () => void
  startSession: () => void
  beginPromptSubmission: (input: { messageId: string; prompt: string }) => void
  appendAssistantText: (text: string) => void
  finishAssistantResponse: () => void
  failAssistantResponse: (message: string) => void
  setSessionHistory: (sessions: SessionListItem[]) => void
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
      sessionStartTime: null,

      clearConversation: () =>
        set((state) => ({
          errorMessage: null,
          isSubmitting: false,
          messages: [],
          sessionHistory: state.sessionHistory,
          activeAssistantMessageId: null,
          sessionStartTime: null,
        })),

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
          }
        }),

      setSessionHistory: (sessions: SessionListItem[]) =>
        set({
          sessionHistory: sessions,
        }),

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
        sessionStartTime: state.sessionStartTime,
      }),
    },
  ),
)
