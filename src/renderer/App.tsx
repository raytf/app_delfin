import { useEffect, useState } from 'react'
import ExpandedSessionView from './components/ExpandedSessionView'
import HomeScreen from './components/HomeScreen'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import {
  IPC_CHANNELS,
  type CaptureFrame,
  type MinimizedOverlayVariant,
  type OverlayMode,
  type SessionMode,
  type SidecarStatus,
  type StructuredResponse,
} from '../shared/types'

export default function App() {
  const [sessionMode, setSessionMode] = useState<SessionMode>('home')
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('expanded')
  const [minimizedVariant, setMinimizedVariant] = useState<MinimizedOverlayVariant>('compact')
  const [captureSourceLabel, setCaptureSourceLabel] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>({ connected: false })
  const [streamedText, setStreamedText] = useState('')
  const [structuredResponse, setStructuredResponse] = useState<StructuredResponse | null>(null)

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

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    window.api.onFrameCaptured((frame: CaptureFrame) => {
      setCaptureSourceLabel(frame.sourceLabel)
    })

    window.api.onSidecarToken((data) => {
      setStreamedText((current) => current + data.text)
    })

    window.api.onSidecarStructured((data) => {
      setStructuredResponse(data)
    })

    window.api.onSidecarDone(() => {
      setIsSubmitting(false)
    })

    window.api.onSidecarError((data) => {
      setErrorMessage(data.message)
      setIsSubmitting(false)
    })

    window.api.onSidecarStatus((status) => {
      setSidecarStatus(status)
    })

    return () => {
      window.api.removeAllListeners(IPC_CHANNELS.FRAME_CAPTURED)
      window.api.removeAllListeners(IPC_CHANNELS.SIDECAR_TOKEN)
      window.api.removeAllListeners(IPC_CHANNELS.SIDECAR_STRUCTURED)
      window.api.removeAllListeners(IPC_CHANNELS.SIDECAR_DONE)
      window.api.removeAllListeners(IPC_CHANNELS.SIDECAR_ERROR)
      window.api.removeAllListeners(IPC_CHANNELS.SIDECAR_STATUS)
    }
  }, [])

  async function handleStartSession(): Promise<void> {
    await window.api.startSession()
    setSessionMode('active')
    setOverlayMode('minimized')
    setMinimizedVariant('compact')
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
    setSessionMode('home')
    setOverlayMode('expanded')
    setMinimizedVariant('compact')
  }

  async function handleSetMinimizedVariant(variant: MinimizedOverlayVariant): Promise<void> {
    await window.api.setMinimizedOverlayVariant(variant)
    setOverlayMode('minimized')
    setMinimizedVariant(variant)
  }

  async function handleSubmitPrompt(text: string): Promise<void> {
    const trimmedText = text.trim()

    if (trimmedText.length === 0) {
      return
    }

    setErrorMessage(null)
    setIsSubmitting(true)
    setStreamedText('')
    setStructuredResponse(null)

    try {
      await window.api.submitSessionPrompt({
        text: trimmedText,
        presetId: 'lecture-slide',
      })
      setStreamedText(`Prompt queued locally: "${trimmedText}"\n\nSidecar integration is not wired yet, so no response will stream yet.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit prompt.')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
  }

  if (sessionMode === 'active' && overlayMode === 'minimized') {
    return (
      <MinimizedSessionBar
        isSubmitting={isSubmitting}
        minimizedVariant={minimizedVariant}
        responseText={streamedText}
        onOpen={() => {
          void handleRestoreOverlay()
        }}
        onSetPromptOpen={(isOpen) => {
          void handleSetMinimizedVariant(isOpen ? 'prompt' : 'compact')
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
        streamedText={streamedText}
        structuredResponse={structuredResponse}
      />
    )
  }

  return (
    <HomeScreen
      onStartSession={() => {
        void handleStartSession()
      }}
    />
  )
}
