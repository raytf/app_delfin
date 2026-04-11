import { useCallback, useEffect, useRef, useState } from 'react'
import ExpandedSessionView from './components/ExpandedSessionView'
import HomeScreen from './components/HomeScreen'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import { useVAD } from './hooks/useVAD'
import { useSessionStore } from './stores/sessionStore'
import { decodeAudioChunk } from './utils/audioUtils'
import {
  type ChatMessage,
  MAIN_TO_RENDERER_CHANNELS,
  type CaptureFrame,
  type MinimizedOverlayVariant,
  type OverlayMode,
  type SessionMode,
  type SidecarStatus,
} from '../shared/types'
import { VOICE_TURN_TEXT } from '../shared/constants'

function getLatestAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index]
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
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const clearConversation = useSessionStore((state) => state.clearConversation)
  const beginPromptSubmission = useSessionStore((state) => state.beginPromptSubmission)
  const beginVoiceTurn = useSessionStore((state) => state.beginVoiceTurn)
  const appendAssistantText = useSessionStore((state) => state.appendAssistantText)
  const finishAssistantResponse = useSessionStore((state) => state.finishAssistantResponse)
  const failAssistantResponse = useSessionStore((state) => state.failAssistantResponse)
  const sessionHistory = useSessionStore((state) => state.sessionHistory)
  const setSessionHistory = useSessionStore((state) => state.setSessionHistory)
  const errorMessage = useSessionStore((state) => state.errorMessage)
  const isSubmitting = useSessionStore((state) => state.isSubmitting)
  const messages = useSessionStore((state) => state.messages)
  const latestAssistantMessage = getLatestAssistantMessage(messages)
  const latestResponseText = latestAssistantMessage?.content ?? null
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const audioNextStartTimeRef = useRef(0)
  const audioStreamActiveRef = useRef(false)
  const audioStartedForTurnRef = useRef(false)
  const isAudioPlayingRef = useRef(false)
  const fallbackSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingVoiceWavRef = useRef<string | null>(null)

  // ---------------------------------------------------------------------------
  // VAD — always-on mic when session is active and VOICE_ENABLED=true
  // ---------------------------------------------------------------------------
  const voiceEnabled = window.api.voiceEnabled
  const ttsEnabled = window.api.ttsEnabled

  const setAudioPlayingState = useCallback((nextValue: boolean) => {
    isAudioPlayingRef.current = nextValue
    setIsAudioPlaying(nextValue)
  }, [])

  const clearFallbackSpeechTimer = useCallback(() => {
    if (fallbackSpeechTimerRef.current !== null) {
      clearTimeout(fallbackSpeechTimerRef.current)
      fallbackSpeechTimerRef.current = null
    }
  }, [])

  const cancelSpeechSynthesis = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }, [])

  const stopScheduledAudioSources = useCallback(() => {
    for (const sourceNode of audioSourceNodesRef.current) {
      try {
        sourceNode.stop()
      } catch {
        // already stopped
      }
      sourceNode.disconnect()
    }

    audioSourceNodesRef.current.clear()

    if (audioContextRef.current !== null) {
      audioNextStartTimeRef.current = audioContextRef.current.currentTime
    }
  }, [])

  const ensureAudioContext = useCallback(async (): Promise<AudioContext | null> => {
    try {
      let audioContext = audioContextRef.current
      if (audioContext === null || audioContext.state === 'closed') {
        audioContext = new AudioContext({ sampleRate: 24_000 })
        audioContextRef.current = audioContext
      }

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      return audioContext
    } catch (error) {
      console.error('[App] Failed to initialise audio context:', error)
      return null
    }
  }, [])

  const { raiseThreshold, lowerThreshold, isListening, isMuted, toggleMute } = useVAD({
    enabled: voiceEnabled && sessionMode === 'active',
    onSpeechEnd: (wavBase64: string) => {
      if (sessionMode !== 'active') {
        return
      }

      if (useSessionStore.getState().isSubmitting) {
        pendingVoiceWavRef.current = wavBase64
        return
      }

      audioStartedForTurnRef.current = false
      clearFallbackSpeechTimer()
      beginVoiceTurn()

      window.api
        .submitSessionPrompt({
          text: VOICE_TURN_TEXT,
          presetId: 'lecture-slide',
          audio: wavBase64,
        })
        .catch((err: unknown) => {
          failAssistantResponse(err instanceof Error ? err.message : 'Voice turn failed.')
        })
    },
    onSpeechStart: () => {
      if (
        !useSessionStore.getState().isSubmitting &&
        !isAudioPlayingRef.current &&
        !audioStreamActiveRef.current &&
        fallbackSpeechTimerRef.current === null
      ) {
        return
      }

      clearFallbackSpeechTimer()
      cancelSpeechSynthesis()
      stopScheduledAudioSources()
      audioStreamActiveRef.current = false
      setAudioPlayingState(false)
      lowerThreshold()

      try {
        window.api.sidecarInterrupt()
      } catch (error) {
        console.error('[App] Failed to send sidecar interrupt:', error)
      }
    },
  })

  const finishAudioPlayback = useCallback(() => {
    audioStreamActiveRef.current = false
    setAudioPlayingState(false)
    lowerThreshold()
  }, [lowerThreshold, setAudioPlayingState])

  const speakWithWebSpeech = useCallback((text: string) => {
    const trimmedText = text.trim()
    if (!ttsEnabled || trimmedText.length === 0 || !('speechSynthesis' in window)) {
      return
    }

    clearFallbackSpeechTimer()
    fallbackSpeechTimerRef.current = setTimeout(() => {
      fallbackSpeechTimerRef.current = null

      if (audioStartedForTurnRef.current) {
        return
      }

      cancelSpeechSynthesis()

      const utterance = new SpeechSynthesisUtterance(trimmedText)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.onstart = () => {
        setAudioPlayingState(true)
        raiseThreshold()
      }
      utterance.onend = () => {
        finishAudioPlayback()
      }
      utterance.onerror = () => {
        finishAudioPlayback()
      }

      window.speechSynthesis.speak(utterance)
    }, 500)
  }, [cancelSpeechSynthesis, clearFallbackSpeechTimer, finishAudioPlayback, raiseThreshold, setAudioPlayingState, ttsEnabled])

  const submitPendingVoiceTurn = useCallback(() => {
    if (sessionMode !== 'active') {
      pendingVoiceWavRef.current = null
      return
    }

    const pendingWav = pendingVoiceWavRef.current
    if (pendingWav === null) {
      return
    }

    pendingVoiceWavRef.current = null
    audioStartedForTurnRef.current = false
    clearFallbackSpeechTimer()
    beginVoiceTurn()

    window.api
      .submitSessionPrompt({
        text: VOICE_TURN_TEXT,
        presetId: 'lecture-slide',
        audio: pendingWav,
      })
      .catch((err: unknown) => {
        failAssistantResponse(err instanceof Error ? err.message : 'Voice turn failed.')
      })
  }, [beginVoiceTurn, clearFallbackSpeechTimer, failAssistantResponse, sessionMode])

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

    window.api.onSidecarAudioStart(() => {
      clearFallbackSpeechTimer()
      cancelSpeechSynthesis()
      stopScheduledAudioSources()
      audioStartedForTurnRef.current = true
      audioStreamActiveRef.current = true
      setAudioPlayingState(true)
      raiseThreshold()
      void ensureAudioContext()
    })

    window.api.onSidecarAudioChunk((data) => {
      void (async () => {
        const audioContext = await ensureAudioContext()
        if (audioContext === null) {
          return
        }

        const audioBuffer = decodeAudioChunk(data.audio, audioContext)
        const startAt = Math.max(audioNextStartTimeRef.current, audioContext.currentTime)
        const sourceNode = audioContext.createBufferSource()
        sourceNode.buffer = audioBuffer
        sourceNode.connect(audioContext.destination)
        sourceNode.onended = () => {
          sourceNode.disconnect()
          audioSourceNodesRef.current.delete(sourceNode)
          if (!audioStreamActiveRef.current && audioSourceNodesRef.current.size === 0) {
            finishAudioPlayback()
          }
        }

        audioSourceNodesRef.current.add(sourceNode)
        sourceNode.start(startAt)
        audioNextStartTimeRef.current = startAt + audioBuffer.duration
      })()
    })

    window.api.onSidecarAudioEnd(() => {
      audioStreamActiveRef.current = false
      if (audioSourceNodesRef.current.size === 0) {
        finishAudioPlayback()
      }
    })

    window.api.onSidecarDone(() => {
      finishAssistantResponse()

      if (pendingVoiceWavRef.current !== null) {
        submitPendingVoiceTurn()
        return
      }

      const latestAssistantText = getLatestAssistantMessage(useSessionStore.getState().messages)?.content ?? ''
      speakWithWebSpeech(latestAssistantText)
    })

    window.api.onSidecarError((data) => {
      failAssistantResponse(data.message)

      if (pendingVoiceWavRef.current !== null) {
        submitPendingVoiceTurn()
      }
    })

    window.api.onSidecarStatus((status) => {
      setSidecarStatus(status)
    })

    return () => {
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.FRAME_CAPTURED)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS)
    }
  }, [appendAssistantText, cancelSpeechSynthesis, clearFallbackSpeechTimer, ensureAudioContext, failAssistantResponse, finishAudioPlayback, finishAssistantResponse, raiseThreshold, setAudioPlayingState, speakWithWebSpeech, stopScheduledAudioSources, submitPendingVoiceTurn])

  useEffect(() => {
    return () => {
      clearFallbackSpeechTimer()
      cancelSpeechSynthesis()
      stopScheduledAudioSources()

      if (audioContextRef.current !== null) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [cancelSpeechSynthesis, clearFallbackSpeechTimer, stopScheduledAudioSources])

  async function handleStartSession(): Promise<void> {
    await window.api.startSession()
    setSessionHistory([])
    clearConversation()
    setIsMinimizedPromptComposing(false)
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
    pendingVoiceWavRef.current = null
    clearFallbackSpeechTimer()
    cancelSpeechSynthesis()
    stopScheduledAudioSources()
    finishAudioPlayback()

    try {
      window.api.sidecarInterrupt()
    } catch (error) {
      console.error('[App] Failed to send sidecar interrupt while stopping session:', error)
    }

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

    pendingVoiceWavRef.current = null
    audioStartedForTurnRef.current = false
    clearFallbackSpeechTimer()

    if (isAudioPlayingRef.current || audioStreamActiveRef.current) {
      cancelSpeechSynthesis()
      stopScheduledAudioSources()
      finishAudioPlayback()
      try {
        window.api.sidecarInterrupt()
      } catch (error) {
        console.error('[App] Failed to interrupt audio before manual prompt:', error)
      }
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
    }
  }

  if (sessionMode === 'active' && overlayMode === 'minimized') {
    return (
      <MinimizedSessionBar
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        isMicListening={isListening}
        isMicMuted={isMuted}
        isAudioPlaying={isAudioPlaying}
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
        onToggleMute={toggleMute}
      />
    )
  }

  if (sessionMode === 'active') {
    return (
      <ExpandedSessionView
        captureSourceLabel={captureSourceLabel}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        isMicListening={isListening}
        isMicMuted={isMuted}
        isAudioPlaying={isAudioPlaying}
        messages={messages}
        onMinimize={() => {
          void handleMinimizeOverlay()
        }}
        onSubmitPrompt={(nextText) => {
          void handleSubmitPrompt(nextText)
        }}
        onStop={() => {
          void handleStopSession()
        }}
        onToggleMute={toggleMute}
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
