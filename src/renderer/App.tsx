import { useCallback, useEffect, useRef, useState } from 'react'
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
import AllSessionsPage from './components/AllSessionsPage'
import ExpandedSessionView from './components/ExpandedSessionView'
import HomeScreen from './components/HomeScreen'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import { useVAD } from './hooks/useVAD'
import { useSessionStore } from './stores/sessionStore'
import { decodeAudioChunk } from './utils/audioUtils'
import { getAutoAdvanceMinimizedVariant, getVoiceTurnRevealVariant } from './utils/minimizedOverlay'
import { resolveWaveformPresentation } from './utils/waveformState'

function getLatestAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index]
    }
  }

  return null
}

export default function App() {
  const [homeView, setHomeView] = useState<'landing' | 'all-sessions'>('landing')
  const [sessionMode, setSessionMode] = useState<SessionMode>('home')
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('expanded')
  const [minimizedVariant, setMinimizedVariant] = useState<MinimizedOverlayVariant>('compact')
  const [isMinimizedPromptComposing, setIsMinimizedPromptComposing] = useState(false)
  const [captureSourceLabel, setCaptureSourceLabel] = useState<string | null>(null)
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>({ connected: false })
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [assistantAudioLevel, setAssistantAudioLevel] = useState(0)

  const clearConversation = useSessionStore((state) => state.clearConversation)
  const clearLatestResponse = useSessionStore((state) => state.clearLatestResponse)
  const startSession = useSessionStore((state) => state.startSession)
  const beginPromptSubmission = useSessionStore((state) => state.beginPromptSubmission)
  const beginVoiceTurn = useSessionStore((state) => state.beginVoiceTurn)
  const appendAssistantText = useSessionStore((state) => state.appendAssistantText)
  const finishAssistantResponse = useSessionStore((state) => state.finishAssistantResponse)
  const failAssistantResponse = useSessionStore((state) => state.failAssistantResponse)
  const setUserMessageImagePath = useSessionStore((state) => state.setUserMessageImagePath)
  const sessionHistory = useSessionStore((state) => state.sessionHistory)
  const setSessionHistory = useSessionStore((state) => state.setSessionHistory)
  const errorMessage = useSessionStore((state) => state.errorMessage)
  const isSubmitting = useSessionStore((state) => state.isSubmitting)
  const messages = useSessionStore((state) => state.messages)
  const minimizedResponseMessageId = useSessionStore((state) => state.minimizedResponseMessageId)
  const toggleVadListening = useSessionStore((state) => state.toggleVadListening)
  const vadListeningEnabled = useSessionStore((state) => state.vadListeningEnabled)

  const latestResponseText =
    minimizedResponseMessageId === null
      ? null
      : messages.find((message) => message.id === minimizedResponseMessageId)?.content ?? null

  const audioContextRef = useRef<AudioContext | null>(null)
  const assistantAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioSourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const audioNextStartTimeRef = useRef(0)
  const audioStreamActiveRef = useRef(false)
  const aiStreamingStartedRef = useRef(false)
  const audioStartedForTurnRef = useRef(false)
  const assistantLevelAnimationFrameRef = useRef<number | null>(null)
  const isAudioPlayingRef = useRef(false)
  const fallbackSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingVoiceWavRef = useRef<string | null>(null)
  const lowerThresholdRef = useRef<(() => void) | null>(null)

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
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        assistantAnalyserRef.current = analyser
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

  const finishAudioPlayback = useCallback(() => {
    audioStreamActiveRef.current = false
    setAssistantAudioLevel(0)
    setAudioPlayingState(false)
    lowerThresholdRef.current?.()
  }, [setAudioPlayingState])

  const revealMinimizedVoiceResponse = useCallback(() => {
    const nextVariant = getVoiceTurnRevealVariant({
      minimizedVariant,
      overlayMode,
      sessionMode,
    })

    if (nextVariant === null) {
      return
    }

    setIsMinimizedPromptComposing(false)
    setMinimizedVariant(nextVariant)
    void window.api.setMinimizedOverlayVariant(nextVariant)
  }, [minimizedVariant, overlayMode, sessionMode])

  const submitVoiceTurn = useCallback(
    (wavBase64: string) => {
      if (sessionMode !== 'active') {
        return
      }

      const messageId = crypto.randomUUID()

      aiStreamingStartedRef.current = false
      audioStartedForTurnRef.current = false
      clearFallbackSpeechTimer()
      revealMinimizedVoiceResponse()
      beginVoiceTurn({ messageId })

      void window.api
        .submitSessionPrompt({
          messageId,
          text: VOICE_TURN_TEXT,
          presetId: 'lecture-slide',
          audio: wavBase64,
        })
        .then((response) => {
          setUserMessageImagePath({
            imagePath: response.imagePath,
            messageId: response.messageId,
          })
        })
        .catch((err: unknown) => {
          failAssistantResponse(err instanceof Error ? err.message : 'Voice turn failed.')
        })
    },
    [beginVoiceTurn, clearFallbackSpeechTimer, failAssistantResponse, revealMinimizedVoiceResponse, sessionMode, setUserMessageImagePath],
  )

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
    submitVoiceTurn(pendingWav)
  }, [sessionMode, submitVoiceTurn])

  const { raiseThreshold, lowerThreshold, isListening, isMuted, isUserSpeaking, toggleMute, userAudioLevel } = useVAD({
    enabled: voiceEnabled && sessionMode === 'active',
    onSpeechEnd: (wavBase64: string) => {
      if (sessionMode !== 'active') {
        return
      }

      if (useSessionStore.getState().isSubmitting) {
        pendingVoiceWavRef.current = wavBase64
        return
      }

      submitVoiceTurn(wavBase64)
    },
    onSpeechStart: () => {
      const isAssistantThinking = useSessionStore.getState().isSubmitting && !aiStreamingStartedRef.current
      if (isAssistantThinking) {
        return
      }

      const isAssistantSpeaking =
        isAudioPlayingRef.current ||
        audioStreamActiveRef.current ||
        fallbackSpeechTimerRef.current !== null

      if (!isAssistantSpeaking) {
        return
      }

      clearFallbackSpeechTimer()
      cancelSpeechSynthesis()
      stopScheduledAudioSources()
      aiStreamingStartedRef.current = false
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

  lowerThresholdRef.current = lowerThreshold

  const showVoiceWaveform = voiceEnabled && vadListeningEnabled
  const waveformPresentation = resolveWaveformPresentation({
    assistantAudioLevel,
    isAssistantSpeaking: isAudioPlaying,
    isProcessing: isSubmitting,
    isUserSpeaking,
    userAudioLevel,
  })

  useEffect(() => {
    if (!isAudioPlaying) {
      if (assistantLevelAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(assistantLevelAnimationFrameRef.current)
        assistantLevelAnimationFrameRef.current = null
      }
      setAssistantAudioLevel(0)
      return
    }

    const sampleAssistantLevel = () => {
      const analyser = assistantAnalyserRef.current

      if (analyser === null) {
        assistantLevelAnimationFrameRef.current = window.requestAnimationFrame(sampleAssistantLevel)
        return
      }

      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)

      let sum = 0
      for (const value of data) {
        sum += value
      }

      const average = data.length === 0 ? 0 : sum / data.length
      const normalized = Math.min(1, average / 112)

      setAssistantAudioLevel((previousLevel) => {
        const nextLevel = previousLevel * 0.68 + normalized * 0.32
        return Math.abs(nextLevel - previousLevel) < 0.01 ? previousLevel : nextLevel
      })

      assistantLevelAnimationFrameRef.current = window.requestAnimationFrame(sampleAssistantLevel)
    }

    assistantLevelAnimationFrameRef.current = window.requestAnimationFrame(sampleAssistantLevel)

    return () => {
      if (assistantLevelAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(assistantLevelAnimationFrameRef.current)
        assistantLevelAnimationFrameRef.current = null
      }
      setAssistantAudioLevel(0)
    }
  }, [isAudioPlaying])

  useEffect(() => {
    if (!voiceEnabled || sessionMode !== 'active' || !isListening) {
      return
    }

    const shouldBeMuted = !vadListeningEnabled
    if (isMuted === shouldBeMuted) {
      return
    }

    toggleMute()
  }, [isListening, isMuted, sessionMode, toggleMute, vadListeningEnabled, voiceEnabled])

  const speakWithWebSpeech = useCallback(
    (text: string) => {
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
          aiStreamingStartedRef.current = true
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
    },
    [cancelSpeechSynthesis, clearFallbackSpeechTimer, finishAudioPlayback, raiseThreshold, setAudioPlayingState, ttsEnabled],
  )

  useEffect(() => {
    const nextVariant = getAutoAdvanceMinimizedVariant({
      errorMessage,
      isMinimizedPromptComposing,
      latestResponseText,
      minimizedVariant,
      overlayMode,
      sessionMode,
    })

    if (nextVariant === null) {
      return
    }

    void window.api.setMinimizedOverlayVariant(nextVariant)
    setMinimizedVariant(nextVariant)
  }, [errorMessage, isMinimizedPromptComposing, latestResponseText, minimizedVariant, overlayMode, sessionMode])

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
      aiStreamingStartedRef.current = true
      appendAssistantText(data.text)
    })

    window.api.onSidecarAudioStart(() => {
      clearFallbackSpeechTimer()
      cancelSpeechSynthesis()
      stopScheduledAudioSources()
      aiStreamingStartedRef.current = true
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
        if (assistantAnalyserRef.current !== null) {
          sourceNode.connect(assistantAnalyserRef.current)
        }
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
      aiStreamingStartedRef.current = false
      finishAssistantResponse()

      if (pendingVoiceWavRef.current !== null) {
        submitPendingVoiceTurn()
        return
      }

      const latestAssistantText = getLatestAssistantMessage(useSessionStore.getState().messages)?.content ?? ''
      speakWithWebSpeech(latestAssistantText)
    })

    window.api.onSidecarError((data) => {
      aiStreamingStartedRef.current = false
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

      if (assistantLevelAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(assistantLevelAnimationFrameRef.current)
        assistantLevelAnimationFrameRef.current = null
      }

      setAssistantAudioLevel(0)

      if (audioContextRef.current !== null) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }

      assistantAnalyserRef.current = null
    }
  }, [cancelSpeechSynthesis, clearFallbackSpeechTimer, stopScheduledAudioSources])

  async function handleStartSession(): Promise<void> {
    await window.api.startSession()
    aiStreamingStartedRef.current = false
    setSessionHistory([])
    clearConversation()
    startSession()
    setHomeView('landing')
    setIsMinimizedPromptComposing(false)
    setSessionMode('active')
    setOverlayMode('minimized')
    setMinimizedVariant('compact')
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
    pendingVoiceWavRef.current = null
    aiStreamingStartedRef.current = false
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
    setHomeView('landing')
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

    pendingVoiceWavRef.current = null
    aiStreamingStartedRef.current = false
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

  if (sessionMode === 'active' && overlayMode === 'minimized') {
    return (
      <MinimizedSessionBar
        errorMessage={errorMessage}
        isAudioPlaying={isAudioPlaying}
        isSubmitting={isSubmitting}
        isMicListening={isListening}
        isMicMuted={isMuted}
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
        onToggleVadListening={toggleVadListening}
        vadListeningEnabled={vadListeningEnabled}
        showVoiceWaveform={showVoiceWaveform}
        waveformLevel={waveformPresentation.level}
        waveformState={waveformPresentation.state}
      />
    )
  }

  if (sessionMode === 'active') {
    return (
      <ExpandedSessionView
        captureSourceLabel={captureSourceLabel}
        errorMessage={errorMessage}
        isAudioPlaying={isAudioPlaying}
        isSubmitting={isSubmitting}
        isMicListening={isListening}
        isMicMuted={isMuted}
        messages={messages}
        onMinimize={() => {
          void handleMinimizeOverlay()
        }}
        onStop={() => {
          void handleStopSession()
        }}
        onSubmitPrompt={(nextText) => {
          void handleSubmitPrompt(nextText)
        }}
        onToggleVadListening={toggleVadListening}
        sidecarStatus={sidecarStatus}
        vadListeningEnabled={vadListeningEnabled}
        showVoiceWaveform={showVoiceWaveform}
        waveformLevel={waveformPresentation.level}
        waveformState={waveformPresentation.state}
      />
    )
  }

  if (sessionMode === 'home' && homeView === 'all-sessions') {
    return (
      <AllSessionsPage
        onBack={() => {
          setHomeView('landing')
        }}
        sessions={sessionHistory}
      />
    )
  }

  return (
    <HomeScreen
      onViewAllSessions={() => {
        setHomeView('all-sessions')
      }}
      onStartSession={() => {
        void handleStartSession()
      }}
      sessions={sessionHistory}
    />
  )
}