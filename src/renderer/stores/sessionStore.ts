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
  clearConversation: () => void
  beginPromptSubmission: (prompt: string) => void
  /** Like beginPromptSubmission but marks the user turn as a voice turn so the
   *  UI renders a 🎙️ icon instead of the raw VOICE_TURN_TEXT constant. */
  beginVoiceTurn: () => void
  appendAssistantText: (text: string) => void
  finishAssistantResponse: () => void
  failAssistantResponse: (message: string) => void
  setSessionHistory: (sessions: SessionListItem[]) => void
  toggleVadListening: () => void
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

      clearConversation: () =>
        set((state) => ({
          errorMessage: null,
          isSubmitting: false,
          messages: [],
          sessionHistory: state.sessionHistory,
          activeAssistantMessageId: null,
          vadListeningEnabled: state.vadListeningEnabled,
        })),

      beginPromptSubmission: (prompt: string) =>
        set((state) => {
          const userMessage: ChatMessage = {
            id: createMessageId(),
            role: 'user',
            content: prompt,
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

      beginVoiceTurn: () =>
        set((state) => {
          const userMessage: ChatMessage = {
            id: createMessageId(),
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

      toggleVadListening: () =>
        set((state) => ({
          vadListeningEnabled: !state.vadListeningEnabled,
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
      }),
    },
  ),
)
