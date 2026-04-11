import { useEffect, useState } from 'react'
import AllSessionsPage from './components/AllSessionsPage'
import ExpandedSessionView from './components/ExpandedSessionView'
import HomeScreen from './components/HomeScreen'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import PastSessionView from './components/PastSessionView'
import UserNameModal from './components/UserNameModal'
import { useSessionStore } from './stores/sessionStore'
import { useSettingsStore } from './stores/settingsStore'
import {
  MAIN_TO_RENDERER_CHANNELS,
  type CaptureFrame,
  type MinimizedOverlayVariant,
  type OverlayMode,
  type SessionDetail,
  type SessionMode,
  type SidecarStatus,
} from '../shared/types'

export default function App() {
  const [homeView, setHomeView] = useState<'landing' | 'all-sessions'>('landing')
  const [selectedPastSession, setSelectedPastSession] = useState<SessionDetail | null>(null)
  const [sessionMode, setSessionMode] = useState<SessionMode>('home')
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('expanded')
  const [minimizedVariant, setMinimizedVariant] = useState<MinimizedOverlayVariant>('compact')
  const [isMinimizedPromptComposing, setIsMinimizedPromptComposing] = useState(false)
  const [captureSourceLabel, setCaptureSourceLabel] = useState<string | null>(null)
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>({ connected: false })
  const clearConversation = useSessionStore((state) => state.clearConversation)
  const startSession = useSessionStore((state) => state.startSession)
  const beginPromptSubmission = useSessionStore((state) => state.beginPromptSubmission)
  const appendAssistantText = useSessionStore((state) => state.appendAssistantText)
  const finishAssistantResponse = useSessionStore((state) => state.finishAssistantResponse)
  const failAssistantResponse = useSessionStore((state) => state.failAssistantResponse)
  const clearLatestResponse = useSessionStore((state) => state.clearLatestResponse)
  const removeSessionHistoryItem = useSessionStore((state) => state.removeSessionHistoryItem)
  const setUserMessageImagePath = useSessionStore((state) => state.setUserMessageImagePath)
  const sessionHistory = useSessionStore((state) => state.sessionHistory)
  const setSessionHistory = useSessionStore((state) => state.setSessionHistory)
  const errorMessage = useSessionStore((state) => state.errorMessage)
  const isSubmitting = useSessionStore((state) => state.isSubmitting)
  const messages = useSessionStore((state) => state.messages)
  const minimizedResponseMessageId = useSessionStore((state) => state.minimizedResponseMessageId)
  const userName = useSettingsStore((state) => state.userName)
  const setUserName = useSettingsStore((state) => state.setUserName)
  const latestResponseText =
    minimizedResponseMessageId === null
      ? null
      : messages.find((message) => message.id === minimizedResponseMessageId)?.content ?? null

  useEffect(() => {
    if (sessionMode !== 'active' || overlayMode !== 'minimized' || minimizedVariant === 'compact') {
      return
    }

    const shouldShowResponse =
      !isMinimizedPromptComposing &&
      (errorMessage !== null || (latestResponseText !== null && latestResponseText.length > 0))
    const nextVariant: MinimizedOverlayVariant = shouldShowResponse ? 'prompt-response' : 'prompt-input'

    if (nextVariant === minimizedVariant) {
      return
    }

    void window.api.setMinimizedOverlayVariant(nextVariant)
    setMinimizedVariant(nextVariant)
  }, [errorMessage, isMinimizedPromptComposing, isSubmitting, latestResponseText, minimizedVariant, overlayMode, sessionMode])

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
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS)
    }
  }, [appendAssistantText, failAssistantResponse, finishAssistantResponse])

  async function handleStartSession(sessionName: string): Promise<void> {
    await window.api.startSession()
    setSessionHistory([])
    clearConversation()
    startSession()
    setCaptureSourceLabel(sessionName)
    setHomeView('landing')
    setSelectedPastSession(null)
    setIsMinimizedPromptComposing(false)
    setSessionMode('active')
    setOverlayMode('minimized')
    setMinimizedVariant('compact')
  }

  async function handleAskDelfin(): Promise<void> {
    clearLatestResponse()
    await window.api.setMinimizedOverlayVariant('prompt-input')
    setOverlayMode('minimized')
    setMinimizedVariant('prompt-input')
    setIsMinimizedPromptComposing(true)
  }

  async function handleRestoreOverlay(): Promise<void> {
    setOverlayMode('expanded')
    clearLatestResponse()
    await window.api.restoreOverlay()
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
    setHomeView('landing')
    setSelectedPastSession(null)
    setIsMinimizedPromptComposing(false)
    setSessionMode('home')
    setOverlayMode('expanded')
    setMinimizedVariant('compact')
  }

  async function handleSetMinimizedVariant(variant: MinimizedOverlayVariant): Promise<void> {
    if (variant !== 'prompt-response') {
      clearLatestResponse()
    }

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

    const messageId = crypto.randomUUID()
    setIsMinimizedPromptComposing(false)
    beginPromptSubmission({
      messageId,
      prompt: trimmedText,
    })

    try {
      const response = await window.api.submitSessionPrompt({
        messageId,
        text: trimmedText,
        presetId: 'lecture-slide',
      })

      setUserMessageImagePath({
        imagePath: response.imagePath,
        messageId: response.messageId,
      })
    } catch (error) {
      failAssistantResponse(error instanceof Error ? error.message : 'Failed to submit prompt.')
    }
  }

  async function handleOpenPastSession(sessionId: string): Promise<void> {
    const detail = await window.api.getSessionDetail({ sessionId })
    setSelectedPastSession(detail)
  }

  async function handleDeleteSession(sessionId: string): Promise<void> {
    await window.api.deleteSession({ sessionId })
    removeSessionHistoryItem(sessionId)

    if (selectedPastSession?.session.id === sessionId) {
      setSelectedPastSession(null)
      setHomeView('landing')
    }
  }

  if (sessionMode === 'active' && overlayMode === 'minimized') {
    return (
      <MinimizedSessionBar
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        latestResponseText={latestResponseText}
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
        onSubmitPrompt={(nextText) => {
          void handleSubmitPrompt(nextText)
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
        onAskDelfin={() => {
          void handleAskDelfin()
        }}
        onStop={() => {
          void handleStopSession()
        }}
      />
    )
  }

  if (sessionMode === 'home' && selectedPastSession !== null) {
    return (
      <PastSessionView
        messages={selectedPastSession.messages}
        onBack={() => {
          setSelectedPastSession(null)
        }}
        onDelete={() => {
          void handleDeleteSession(selectedPastSession.session.id)
        }}
        session={selectedPastSession.session}
      />
    )
  }

  if (sessionMode === 'home' && homeView === 'all-sessions') {
    return (
      <AllSessionsPage
        onBack={() => {
          setHomeView('landing')
        }}
        onDeleteSession={(sessionId) => {
          void handleDeleteSession(sessionId)
        }}
        onSelectSession={(sessionId) => {
          void handleOpenPastSession(sessionId)
        }}
        sessions={sessionHistory}
      />
    )
  }

  return (
    <>
      <HomeScreen
        onDeleteSession={(sessionId) => {
          void handleDeleteSession(sessionId)
        }}
        onSelectSession={(sessionId) => {
          void handleOpenPastSession(sessionId)
        }}
        onViewAllSessions={() => {
          setHomeView('all-sessions')
        }}
        sessions={sessionHistory}
        onStartSession={(sessionName) => {
          void handleStartSession(sessionName)
        }}
        userName={userName}
      />
      <UserNameModal
        isOpen={userName === null}
        onSave={(name) => {
          setUserName(name)
        }}
      />
    </>
  )
}
