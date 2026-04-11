import { useEffect, useState } from 'react'
import ExpandedSessionView from './components/ExpandedSessionView'
import HomeScreen from './components/HomeScreen'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import { useSessionStore } from './stores/sessionStore'
import {
  type ChatMessage,
  MAIN_TO_RENDERER_CHANNELS,
  type CaptureFrame,
  type MinimizedOverlayVariant,
  type OverlayMode,
  type SessionMode,
  type SidecarStatus,
  type StructuredResponse,
} from '../shared/types'

function getLatestAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index]
    }
  }

  return null
}

function getLatestStructuredResponse(messages: ChatMessage[]): StructuredResponse | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const structuredData = messages[index]?.structuredData

    if (structuredData !== undefined) {
      return structuredData
    }
  }

  return null
}

export default function App() {
  const [sessionMode, setSessionMode] = useState<SessionMode>('home')
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('expanded')
  const [minimizedVariant, setMinimizedVariant] = useState<MinimizedOverlayVariant>('compact')
  const [isMinimizedPromptComposing, setIsMinimizedPromptComposing] = useState(false)
  const [captureSourceLabel, setCaptureSourceLabel] = useState<string | null>(null)
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>({ connected: false })
  const clearConversation = useSessionStore((state) => state.clearConversation)
  const beginPromptSubmission = useSessionStore((state) => state.beginPromptSubmission)
  const appendAssistantText = useSessionStore((state) => state.appendAssistantText)
  const setAssistantStructured = useSessionStore((state) => state.setAssistantStructured)
  const finishAssistantResponse = useSessionStore((state) => state.finishAssistantResponse)
  const failAssistantResponse = useSessionStore((state) => state.failAssistantResponse)
  const sessionHistory = useSessionStore((state) => state.sessionHistory)
  const setSessionHistory = useSessionStore((state) => state.setSessionHistory)
  const errorMessage = useSessionStore((state) => state.errorMessage)
  const isSubmitting = useSessionStore((state) => state.isSubmitting)
  const messages = useSessionStore((state) => state.messages)
  const latestAssistantMessage = getLatestAssistantMessage(messages)
  const latestStructuredResponse = getLatestStructuredResponse(messages)

  useEffect(() => {
    if (sessionMode !== 'active' || overlayMode !== 'minimized' || minimizedVariant === 'compact') {
      return
    }

    const shouldShowResponse =
      !isMinimizedPromptComposing &&
      (errorMessage !== null || (!isSubmitting && latestStructuredResponse !== null))
    const nextVariant: MinimizedOverlayVariant = shouldShowResponse ? 'prompt-response' : 'prompt-input'

    if (nextVariant === minimizedVariant) {
      return
    }

    void window.api.setMinimizedOverlayVariant(nextVariant)
    setMinimizedVariant(nextVariant)
  }, [errorMessage, isMinimizedPromptComposing, isSubmitting, latestStructuredResponse, minimizedVariant, overlayMode, sessionMode])

  useEffect(() => {
    let cancelled = false

    void window.api.getOverlayState().then((state) => {
      if (cancelled) {
        return
      }

      setSessionMode(state.sessionMode)
      setOverlayMode(state.overlayMode)
      setMinimizedVariant(state.minimizedVariant)
    })

    void window.api.listSessions().then((sessions) => {
      if (cancelled) {
        return
      }

      setSessionHistory(sessions)
    })

    return () => {
      cancelled = true
    }
  }, [setSessionHistory])

  useEffect(() => {
    window.api.onFrameCaptured((frame: CaptureFrame) => {
      setCaptureSourceLabel(frame.sourceLabel)
    })

    window.api.onSidecarToken((data) => {
      appendAssistantText(data.text)
    })

    window.api.onSidecarStructured((data) => {
      setAssistantStructured(data)
    })

    window.api.onSidecarDone(() => {
      finishAssistantResponse()
    })

    window.api.onSidecarError((data) => {
      failAssistantResponse(data.message)
    })

    window.api.onSidecarStatus((status) => {
      setSidecarStatus(status)
    })

    return () => {
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.FRAME_CAPTURED)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STRUCTURED)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS)
    }
  }, [appendAssistantText, failAssistantResponse, finishAssistantResponse, setAssistantStructured])

  async function handleStartSession(): Promise<void> {
    await window.api.startSession()
    setSessionHistory([])
    clearConversation()
    setIsMinimizedPromptComposing(false)
    setSessionMode('active')
    setOverlayMode('minimized')
    setMinimizedVariant('compact')
    setIsMinimizedPromptComposing(false)
  }

  async function handleRestoreOverlay(): Promise<void> {
    await window.api.restoreOverlay()
    setOverlayMode('expanded')
  }

  async function handleMinimizeOverlay(): Promise<void> {
    await window.api.minimizeOverlay()
    setOverlayMode('minimized')
    setMinimizedVariant('compact')
  }

  async function handleStopSession(): Promise<void> {
    await window.api.stopSession()
    const sessions = await window.api.listSessions()
    setSessionHistory(sessions)
    clearConversation()
    setIsMinimizedPromptComposing(false)
    setSessionMode('home')
    setOverlayMode('expanded')
    setMinimizedVariant('compact')
  }

  async function handleSetMinimizedVariant(variant: MinimizedOverlayVariant): Promise<void> {
    await window.api.setMinimizedOverlayVariant(variant)
    setOverlayMode('minimized')
    setMinimizedVariant(variant)
    setIsMinimizedPromptComposing(variant === 'prompt-input')
  }

  async function handleSubmitPrompt(text: string): Promise<void> {
    const trimmedText = text.trim()

    if (trimmedText.length === 0) {
      return
    }

    setIsMinimizedPromptComposing(false)
    beginPromptSubmission(trimmedText)

    try {
      await window.api.submitSessionPrompt({
        text: trimmedText,
        presetId: 'lecture-slide',
      })
    } catch (error) {
      failAssistantResponse(error instanceof Error ? error.message : 'Failed to submit prompt.')
      return
    }
  }

  if (sessionMode === 'active' && overlayMode === 'minimized') {
    return (
      <MinimizedSessionBar
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        latestStructuredResponse={latestStructuredResponse}
        minimizedVariant={minimizedVariant}
        onAskAnother={() => {
          void handleSetMinimizedVariant('prompt-input')
        }}
        onOpen={() => {
          void handleRestoreOverlay()
        }}
        onSetPromptOpen={(isOpen) => {
          void handleSetMinimizedVariant(isOpen ? 'prompt-input' : 'compact')
        }}
        onSubmitPrompt={(text) => {
          void handleSubmitPrompt(text)
        }}
        onStop={() => {
          void handleStopSession()
        }}
      />
    )
  }

  if (sessionMode === 'active') {
    return (
      <ExpandedSessionView
        captureSourceLabel={captureSourceLabel}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        messages={messages}
        onMinimize={() => {
          void handleMinimizeOverlay()
        }}
        onSubmitPrompt={(text) => {
          void handleSubmitPrompt(text)
        }}
        onStop={() => {
          void handleStopSession()
        }}
        sidecarStatus={sidecarStatus}
      />
    )
  }

  return (
    <HomeScreen
      sessions={sessionHistory}
      onStartSession={() => {
        void handleStartSession()
      }}
    />
  )
}
