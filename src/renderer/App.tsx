import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type CaptureFrame,
  type ChatMessage,
  type EndedSessionSnapshot,
  MAIN_TO_RENDERER_CHANNELS,
  type MinimizedOverlayVariant,
  type OverlayMode,
  type SessionDetail,
  type SessionMode,
  type SidecarStatus,
} from '../shared/types'
import { VOICE_TURN_TEXT } from '../shared/constants'
import AllSessionsPage from './components/AllSessionsPage'
import ExpandedSessionView from './components/ExpandedSessionView'
import HomeScreen from './components/HomeScreen'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import PastSessionView from './components/PastSessionView'
import SessionEndedView from './components/SessionEndedView'
import UserNameModal from './components/UserNameModal'
import { useVAD } from './hooks/useVAD'
import { useSessionStore } from './stores/sessionStore'
import { useSettingsStore } from './stores/settingsStore'
import { decodeAudioChunk } from './utils/audioUtils'
import {
  getAutoAdvanceMinimizedVariant,
  getVoiceTurnCompleteVariant,
  getVoiceTurnRevealVariant,
} from './utils/minimizedOverlay'
import {
  createWaveformBars,
  getWaveformActivityLevel,
  reduceFrequencyDataToWaveformBars,
  resolveWaveformPresentation,
  smoothWaveformBars,
  WAVEFORM_BAR_COUNT,
} from './utils/waveformState'

let lastAudioChunkPromise: Promise<void> = Promise.resolve()

const MINIMIZED_VOICE_COLLAPSE_DELAY_MS = 1200

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
  const [selectedPastSession, setSelectedPastSession] = useState<SessionDetail | null>(null)
  const [activeSessionName, setActiveSessionName] = useState('Study Session')
  const [sessionMode, setSessionMode] = useState<SessionMode>('home')
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('expanded')
  const [minimizedVariant, setMinimizedVariant] = useState<MinimizedOverlayVariant>('compact')
  const [isMinimizedPromptComposing, setIsMinimizedPromptComposing] = useState(false)
  const [captureSourceLabel, setCaptureSourceLabel] = useState<string | null>(null)
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>({ connected: false })
  const [endedSessionData, setEndedSessionData] = useState<EndedSessionSnapshot | null>(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [assistantAudioLevel, setAssistantAudioLevel] = useState(0)
  const [assistantWaveformBars, setAssistantWaveformBars] = useState(() =>
    createWaveformBars(),
  )

  const clearConversation = useSessionStore((state) => state.clearConversation)
  const clearLatestResponse = useSessionStore((state) => state.clearLatestResponse)
  const startSession = useSessionStore((state) => state.startSession)
  const beginPromptSubmission = useSessionStore((state) => state.beginPromptSubmission)
  const beginVoiceTurn = useSessionStore((state) => state.beginVoiceTurn)
  const appendAssistantText = useSessionStore((state) => state.appendAssistantText)
  const finishAssistantResponse = useSessionStore((state) => state.finishAssistantResponse)
  const failAssistantResponse = useSessionStore((state) => state.failAssistantResponse)
  const removeSessionHistoryItem = useSessionStore((state) => state.removeSessionHistoryItem)
  const setUserMessageImagePath = useSessionStore((state) => state.setUserMessageImagePath)
  const sessionHistory = useSessionStore((state) => state.sessionHistory)
  const setSessionHistory = useSessionStore((state) => state.setSessionHistory)
  const errorMessage = useSessionStore((state) => state.errorMessage)
  const isSubmitting = useSessionStore((state) => state.isSubmitting)
  const messages = useSessionStore((state) => state.messages)
  const minimizedResponseMessageId = useSessionStore((state) => state.minimizedResponseMessageId)
  const sessionStartTime = useSessionStore((state) => state.sessionStartTime)
  const toggleVadListening = useSessionStore((state) => state.toggleVadListening)
  const vadListeningEnabled = useSessionStore((state) => state.vadListeningEnabled)

  const userName = useSettingsStore((state) => state.userName)
  const setUserName = useSettingsStore((state) => state.setUserName)

  const latestResponseText =
    minimizedResponseMessageId === null
      ? null
      : messages.find((message) => message.id === minimizedResponseMessageId)?.content ?? null

  const audioContextRef = useRef<AudioContext | null>(null)
  const assistantGainNodeRef = useRef<GainNode | null>(null)
  const assistantAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioSourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const audioNextStartTimeRef = useRef(0)
  const audioStreamActiveRef = useRef(false)
  const audioSampleRateRef = useRef(24_000)
  const ignoreIncomingSidecarAudioRef = useRef(false)
  const aiStreamingStartedRef = useRef(false)
  const audioStartedForTurnRef = useRef(false)
  const assistantLevelAnimationFrameRef = useRef<number | null>(null)
  const assistantWaveformBarsRef = useRef(createWaveformBars())
  const assistantWaveformFrequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const isAudioPlayingRef = useRef(false)
  const fallbackSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minimizedVoiceCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingVoiceWavRef = useRef<string | null>(null)
  const lowerThresholdRef = useRef<(() => void) | null>(null)

  const voiceEnabled = window.api.voiceEnabled
  const ttsEnabled = window.api.ttsEnabled

  const setAudioPlayingState = useCallback((nextValue: boolean) => {
    isAudioPlayingRef.current = nextValue
    setIsAudioPlaying(nextValue)
  }, [])

  const resetAssistantWaveform = useCallback(() => {
    const emptyBars = createWaveformBars(WAVEFORM_BAR_COUNT)
    assistantWaveformBarsRef.current = emptyBars
    assistantWaveformFrequencyDataRef.current = null
    setAssistantWaveformBars(emptyBars)
    setAssistantAudioLevel(0)
  }, [])

  const stopAssistantWaveformLoop = useCallback(() => {
    if (assistantLevelAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(assistantLevelAnimationFrameRef.current)
      assistantLevelAnimationFrameRef.current = null
    }
  }, [])

  const startAssistantWaveformLoop = useCallback(() => {
    if (assistantLevelAnimationFrameRef.current !== null) {
      return
    }

    const sample = () => {
      const analyser = assistantAnalyserRef.current
      if (analyser === null) {
        stopAssistantWaveformLoop()
        return
      }

      if (
        assistantWaveformFrequencyDataRef.current === null ||
        assistantWaveformFrequencyDataRef.current.length !== analyser.frequencyBinCount
      ) {
        assistantWaveformFrequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount)
      }

      analyser.getByteFrequencyData(assistantWaveformFrequencyDataRef.current)
      const reducedBars = reduceFrequencyDataToWaveformBars(
        assistantWaveformFrequencyDataRef.current,
        WAVEFORM_BAR_COUNT,
      )
      const nextBars = smoothWaveformBars(assistantWaveformBarsRef.current, reducedBars, {
        attack: 0.36,
        release: 0.14,
      })
      const nextLevel = getWaveformActivityLevel(nextBars)

      assistantWaveformBarsRef.current = nextBars
      setAssistantWaveformBars(nextBars)
      setAssistantAudioLevel(nextLevel)

      const shouldContinue =
        isAudioPlayingRef.current || audioStreamActiveRef.current || nextLevel > 0.014
      if (!shouldContinue) {
        stopAssistantWaveformLoop()
        return
      }

      assistantLevelAnimationFrameRef.current = window.requestAnimationFrame(sample)
    }

    assistantLevelAnimationFrameRef.current = window.requestAnimationFrame(sample)
  }, [stopAssistantWaveformLoop])

  const clearFallbackSpeechTimer = useCallback(() => {
    if (fallbackSpeechTimerRef.current !== null) {
      clearTimeout(fallbackSpeechTimerRef.current)
      fallbackSpeechTimerRef.current = null
    }
  }, [])

  const clearMinimizedVoiceCollapseTimer = useCallback(() => {
    if (minimizedVoiceCollapseTimerRef.current !== null) {
      clearTimeout(minimizedVoiceCollapseTimerRef.current)
      minimizedVoiceCollapseTimerRef.current = null
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
        // Source might have already finished.
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
        audioContext = new AudioContext({ sampleRate: audioSampleRateRef.current })
        audioContextRef.current = audioContext
        const gainNode = audioContext.createGain()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        gainNode.connect(analyser)
        analyser.connect(audioContext.destination)
        assistantGainNodeRef.current = gainNode
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
    setAudioPlayingState(false)
    lowerThresholdRef.current?.()
  }, [setAudioPlayingState])

  const syncOverlayStateFromMain = useCallback(async (): Promise<void> => {
    try {
      const state = await window.api.getOverlayState()
      clearMinimizedVoiceCollapseTimer()
      setSessionMode(state.sessionMode)
      setOverlayMode(state.overlayMode)
      setMinimizedVariant(state.minimizedVariant)
      setEndedSessionData(state.endedSessionData)
      setIsMinimizedPromptComposing(
        state.overlayMode === 'minimized' && state.minimizedVariant === 'prompt-input',
      )
    } catch (error) {
      console.error('[App] Failed to sync overlay state after IPC error:', error)
    }
  }, [clearMinimizedVoiceCollapseTimer])

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
      clearMinimizedVoiceCollapseTimer()
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
        .catch((error: unknown) => {
          failAssistantResponse(error instanceof Error ? error.message : 'Voice turn failed.')
        })
    },
    [
      beginVoiceTurn,
      clearFallbackSpeechTimer,
      clearMinimizedVoiceCollapseTimer,
      failAssistantResponse,
      revealMinimizedVoiceResponse,
      sessionMode,
      setUserMessageImagePath,
    ],
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

  const {
    raiseThreshold,
    lowerThreshold,
    isListening,
    isMuted,
    isUserSpeaking,
    toggleMute,
    userAudioLevel,
    userWaveformBars,
  } = useVAD({
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
      const submitting = useSessionStore.getState().isSubmitting
      const isAssistantThinking = submitting && !aiStreamingStartedRef.current
      if (isAssistantThinking) {
        return
      }

      const isAssistantSpeaking =
        isAudioPlayingRef.current ||
        audioStreamActiveRef.current ||
        fallbackSpeechTimerRef.current !== null
      const isAssistantStreaming = aiStreamingStartedRef.current && submitting

      if (!isAssistantSpeaking && !isAssistantStreaming) {
        return
      }

      clearFallbackSpeechTimer()
      cancelSpeechSynthesis()
      stopScheduledAudioSources()
      ignoreIncomingSidecarAudioRef.current = true
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
    assistantWaveformBars,
    isAssistantSpeaking: isAudioPlaying,
    isProcessing: isSubmitting,
    isUserSpeaking,
    userAudioLevel,
    userWaveformBars,
  })

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
        utterance.rate = 1
        utterance.pitch = 1
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
    [
      cancelSpeechSynthesis,
      clearFallbackSpeechTimer,
      finishAudioPlayback,
      raiseThreshold,
      setAudioPlayingState,
      ttsEnabled,
    ],
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
  }, [
    errorMessage,
    isMinimizedPromptComposing,
    latestResponseText,
    minimizedVariant,
    overlayMode,
    sessionMode,
  ])

  const handleSetMinimizedVariant = useCallback(
    async (variant: MinimizedOverlayVariant): Promise<void> => {
      clearMinimizedVoiceCollapseTimer()

      try {
        await window.api.setMinimizedOverlayVariant(variant)

        if (variant !== 'prompt-response') {
          clearLatestResponse()
        }

        setOverlayMode('minimized')
        setMinimizedVariant(variant)
        setIsMinimizedPromptComposing(variant === 'prompt-input')
      } catch (error) {
        console.error('[App] Failed to set minimized overlay variant:', error)
        void syncOverlayStateFromMain()
      }
    },
    [clearLatestResponse, clearMinimizedVoiceCollapseTimer, syncOverlayStateFromMain],
  )

  useEffect(() => {
    const nextVariant = getVoiceTurnCompleteVariant({
      errorMessage,
      hasResponseText: latestResponseText !== null && latestResponseText.trim().length > 0,
      isAudioPlaying,
      isSubmitting,
      minimizedVariant,
      overlayMode,
      sessionMode,
    })

    clearMinimizedVoiceCollapseTimer()

    if (nextVariant === null) {
      return
    }

    minimizedVoiceCollapseTimerRef.current = window.setTimeout(() => {
      minimizedVoiceCollapseTimerRef.current = null
      void handleSetMinimizedVariant(nextVariant)
    }, MINIMIZED_VOICE_COLLAPSE_DELAY_MS)

    return () => {
      clearMinimizedVoiceCollapseTimer()
    }
  }, [
    clearMinimizedVoiceCollapseTimer,
    errorMessage,
    handleSetMinimizedVariant,
    isAudioPlaying,
    isSubmitting,
    latestResponseText,
    minimizedVariant,
    overlayMode,
    sessionMode,
  ])

  useEffect(() => {
    let cancelled = false

    void window.api.getOverlayState().then((state) => {
      if (cancelled) {
        return
      }

      setSessionMode(state.sessionMode)
      setOverlayMode(state.overlayMode)
      setMinimizedVariant(state.minimizedVariant)
      setEndedSessionData(state.endedSessionData)
      setIsMinimizedPromptComposing(
        state.overlayMode === 'minimized' && state.minimizedVariant === 'prompt-input',
      )
    })

    void window.api.listSessions().then((sessions) => {
      if (!cancelled) {
        setSessionHistory(sessions)
      }
    })

    return () => {
      cancelled = true
    }
  }, [setSessionHistory])

  useEffect(() => {
    window.api.onFrameCaptured((frame: CaptureFrame) => {
      setCaptureSourceLabel(frame.sourceLabel)
    })

    window.api.onOverlayError((data) => {
      console.error('[App] Overlay IPC error:', data.message)
      void syncOverlayStateFromMain()
    })

    window.api.onSidecarToken((data) => {
      aiStreamingStartedRef.current = true
      appendAssistantText(data.text)
    })

    window.api.onSidecarAudioStart((data) => {
      ignoreIncomingSidecarAudioRef.current = false
      clearFallbackSpeechTimer()
      cancelSpeechSynthesis()
      stopScheduledAudioSources()
      resetAssistantWaveform()
      aiStreamingStartedRef.current = true
      audioStartedForTurnRef.current = true
      audioStreamActiveRef.current = true
      audioSampleRateRef.current = data.sampleRate
      setAudioPlayingState(true)
      raiseThreshold()
      void ensureAudioContext().then(() => {
        startAssistantWaveformLoop()
      })
    })

    window.api.onSidecarAudioChunk((data) => {
      if (ignoreIncomingSidecarAudioRef.current) {
        return
      }

      lastAudioChunkPromise = lastAudioChunkPromise
        .then(async () => {
          const audioContext = await ensureAudioContext()
          if (audioContext === null) {
            return
          }

          const audioBuffer = decodeAudioChunk(
            data.audio,
            audioContext,
            audioSampleRateRef.current,
          )
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
        })
        .catch(() => {})
    })

    window.api.onSidecarAudioEnd((data) => {
      if (ignoreIncomingSidecarAudioRef.current) {
        audioStreamActiveRef.current = false
        return
      }

      audioStreamActiveRef.current = false
      if (data.ttsTime > 0) {
        console.debug(`[App] TTS synthesis took ${data.ttsTime}s`)
      }
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

      const latestAssistantText =
        getLatestAssistantMessage(useSessionStore.getState().messages)?.content ?? ''
      speakWithWebSpeech(latestAssistantText)
    })

    window.api.onSidecarError((data) => {
      aiStreamingStartedRef.current = false
      audioStartedForTurnRef.current = false
      stopScheduledAudioSources()
      cancelSpeechSynthesis()
      clearFallbackSpeechTimer()
      finishAudioPlayback()
      pendingVoiceWavRef.current = null
      failAssistantResponse(data.message)
    })

    window.api.onSidecarStatus((status) => {
      setSidecarStatus(status)
    })

    return () => {
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.FRAME_CAPTURED)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS)
    }
  }, [
    appendAssistantText,
    cancelSpeechSynthesis,
    clearFallbackSpeechTimer,
    ensureAudioContext,
    failAssistantResponse,
    finishAudioPlayback,
    finishAssistantResponse,
    raiseThreshold,
    resetAssistantWaveform,
    setAudioPlayingState,
    speakWithWebSpeech,
    startAssistantWaveformLoop,
    stopScheduledAudioSources,
    submitPendingVoiceTurn,
    syncOverlayStateFromMain,
  ])

  useEffect(() => {
    return () => {
      clearMinimizedVoiceCollapseTimer()
      clearFallbackSpeechTimer()
      cancelSpeechSynthesis()
      stopScheduledAudioSources()
      stopAssistantWaveformLoop()
      resetAssistantWaveform()

      if (audioContextRef.current !== null) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }

      assistantGainNodeRef.current = null
      assistantAnalyserRef.current = null
    }
  }, [
    cancelSpeechSynthesis,
    clearFallbackSpeechTimer,
    clearMinimizedVoiceCollapseTimer,
    resetAssistantWaveform,
    stopAssistantWaveformLoop,
    stopScheduledAudioSources,
  ])

  async function handleStartSession(sessionName: string): Promise<void> {
    await window.api.startSession({ sessionName })
    aiStreamingStartedRef.current = false
    audioStartedForTurnRef.current = false
    pendingVoiceWavRef.current = null
    clearMinimizedVoiceCollapseTimer()
    clearFallbackSpeechTimer()
    cancelSpeechSynthesis()
    stopScheduledAudioSources()
    stopAssistantWaveformLoop()
    resetAssistantWaveform()
    finishAudioPlayback()
    ignoreIncomingSidecarAudioRef.current = false
    setCaptureSourceLabel(null)
    setSessionHistory([])
    clearConversation()
    startSession()
    setActiveSessionName(sessionName)
    setHomeView('landing')
    setSelectedPastSession(null)
    setEndedSessionData(null)
    setIsMinimizedPromptComposing(false)
    setSessionMode('active')
    setOverlayMode('minimized')
    setMinimizedVariant('compact')
  }

  async function handleRestoreOverlay(): Promise<void> {
    clearMinimizedVoiceCollapseTimer()
    setOverlayMode('expanded')
    clearLatestResponse()
    await window.api.restoreOverlay()
  }

  async function handleMinimizeOverlay(): Promise<void> {
    clearLatestResponse()
    clearMinimizedVoiceCollapseTimer()
    await window.api.minimizeOverlay()
    setOverlayMode('minimized')
    setMinimizedVariant('compact')
  }

  async function handleStopSession(): Promise<void> {
    const userMessageCount = messages.filter((message) => message.role === 'user').length
    const duration = sessionStartTime === null ? 0 : Date.now() - sessionStartTime
    const nextEndedSessionData: EndedSessionSnapshot = {
      sessionName: activeSessionName,
      duration,
      messageCount: userMessageCount,
    }

    clearMinimizedVoiceCollapseTimer()
    pendingVoiceWavRef.current = null
    aiStreamingStartedRef.current = false
    audioStartedForTurnRef.current = false
    clearFallbackSpeechTimer()
    cancelSpeechSynthesis()
    stopScheduledAudioSources()
    stopAssistantWaveformLoop()
    resetAssistantWaveform()
    finishAudioPlayback()
    setEndedSessionData(nextEndedSessionData)

    if (audioContextRef.current !== null) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    assistantGainNodeRef.current = null
    assistantAnalyserRef.current = null

    try {
      window.api.sidecarInterrupt()
    } catch (error) {
      console.error('[App] Failed to send sidecar interrupt while stopping session:', error)
    }

    await window.api.stopSession({
      endedSessionData: nextEndedSessionData,
    })

    const sessions = await window.api.listSessions()
    setSessionHistory(sessions)
    clearConversation()
    setActiveSessionName('Study Session')
    setHomeView('landing')
    setSelectedPastSession(null)
    setIsMinimizedPromptComposing(false)
    setSessionMode('home')
    setOverlayMode('expanded')
    setMinimizedVariant('compact')
  }

  function handleGoHomeFromEnded(): void {
    setEndedSessionData(null)
    setHomeView('landing')
    setSelectedPastSession(null)
    void window.api.clearEndedSession()
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
    clearMinimizedVoiceCollapseTimer()
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

  if (endedSessionData !== null) {
    return (
      <SessionEndedView
        duration={endedSessionData.duration}
        messageCount={endedSessionData.messageCount}
        onGoHome={handleGoHomeFromEnded}
        sessionName={endedSessionData.sessionName}
      />
    )
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
        showVoiceWaveform={showVoiceWaveform}
        vadListeningEnabled={vadListeningEnabled}
        waveformBars={waveformPresentation.bars}
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
        sessionName={activeSessionName}
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
        showVoiceWaveform={showVoiceWaveform}
        sidecarStatus={sidecarStatus}
        vadListeningEnabled={vadListeningEnabled}
        waveformBars={waveformPresentation.bars}
        waveformState={waveformPresentation.state}
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
        onStartSession={(sessionName) => {
          void handleStartSession(sessionName)
        }}
        onViewAllSessions={() => {
          setHomeView('all-sessions')
        }}
        sessions={sessionHistory}
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
