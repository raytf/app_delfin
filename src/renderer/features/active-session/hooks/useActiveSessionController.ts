import type { Dispatch } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type ChatMessage,
  type EndedSessionSnapshot,
  MAIN_TO_RENDERER_CHANNELS,
  type OverlayMode,
} from '../../../../shared/types'
import { VOICE_TURN_TEXT } from '../../../../shared/constants'
import {
  type ActiveScreenAction,
  type ActiveScreenState,
} from '../../../navigation/screenState'
import { useSessionStore } from '../../../stores/sessionStore'
import { decodeAudioChunk } from '../../../utils/audioUtils'
import {
  getAutoAdvanceMinimizedVariant,
  getVoiceTurnCompleteVariant,
} from '../../../utils/minimizedOverlay'
import {
  createWaveformBars,
  getWaveformActivityLevel,
  reduceFrequencyDataToWaveformBars,
  resolveWaveformPresentation,
  smoothWaveformBars,
  type WaveformVisualState,
  WAVEFORM_BAR_COUNT,
} from '../../../utils/waveformState'
import { useVAD } from './useVAD'

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

interface UseActiveSessionControllerArgs {
  onBeginSessionEnd: (snapshot: EndedSessionSnapshot) => void
  onSessionEndCommitted: (snapshot: EndedSessionSnapshot) => void
  reconcileScreenStateFromMain: () => Promise<void>
  screenState: ActiveScreenState
  sessionName: string
  transitionScreen: Dispatch<ActiveScreenAction>
}

interface ActiveSessionController {
  errorMessage: string | null
  handleAskAnother: () => Promise<void>
  handleMinimizeOverlay: () => Promise<void>
  handleRestoreOverlay: () => Promise<void>
  handleSetMode: (mode: Exclude<OverlayMode, 'expanded'>) => Promise<void>
  handleStopSession: () => Promise<void>
  handleSubmitPrompt: (text: string) => Promise<void>
  isAudioPlaying: boolean
  isListening: boolean
  isMuted: boolean
  isSubmitting: boolean
  latestResponseText: string | null
  messages: ChatMessage[]
  toggleVadListening: () => void
  vadListeningEnabled: boolean
  waveformState: WaveformVisualState
}

export function useActiveSessionController({
  onBeginSessionEnd,
  onSessionEndCommitted,
  reconcileScreenStateFromMain,
  screenState,
  sessionName,
  transitionScreen,
}: UseActiveSessionControllerArgs): ActiveSessionController {
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [assistantAudioLevel, setAssistantAudioLevel] = useState(0)
  const [assistantWaveformBars, setAssistantWaveformBars] = useState(() =>
    createWaveformBars(),
  )

  const clearConversation = useSessionStore((state) => state.clearConversation)
  const clearLatestResponse = useSessionStore((state) => state.clearLatestResponse)
  const beginPromptSubmission = useSessionStore((state) => state.beginPromptSubmission)
  const beginVoiceTurn = useSessionStore((state) => state.beginVoiceTurn)
  const appendAssistantText = useSessionStore((state) => state.appendAssistantText)
  const finishAssistantResponse = useSessionStore((state) => state.finishAssistantResponse)
  const failAssistantResponse = useSessionStore((state) => state.failAssistantResponse)
  const setUserMessageImagePath = useSessionStore((state) => state.setUserMessageImagePath)
  const errorMessage = useSessionStore((state) => state.errorMessage)
  const isSubmitting = useSessionStore((state) => state.isSubmitting)
  const messages = useSessionStore((state) => state.messages)
  const activeAssistantMessageId = useSessionStore((state) => state.activeAssistantMessageId)
  const minimizedResponseMessageId = useSessionStore((state) => state.minimizedResponseMessageId)
  const sessionStartTime = useSessionStore((state) => state.sessionStartTime)
  const toggleVadListening = useSessionStore((state) => state.toggleVadListening)
  const vadListeningEnabled = useSessionStore((state) => state.vadListeningEnabled)

  const minimizedResponseMessage =
    minimizedResponseMessageId === null
      ? null
      : messages.find((message) => message.id === minimizedResponseMessageId) ?? null
  const activeAssistantMessage =
    activeAssistantMessageId === null
      ? null
      : messages.find((message) => message.id === activeAssistantMessageId) ?? null
  const latestAssistantMessage = getLatestAssistantMessage(messages)
  const liveAssistantResponseText =
    activeAssistantMessage?.content ??
    (isSubmitting ? latestAssistantMessage?.content ?? null : null)
  const latestResponseText = liveAssistantResponseText ?? minimizedResponseMessage?.content ?? null

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
      console.error('[useActiveSessionController] Failed to initialise audio context:', error)
      return null
    }
  }, [])

  const finishAudioPlayback = useCallback(() => {
    audioStreamActiveRef.current = false
    setAudioPlayingState(false)
    lowerThresholdRef.current?.()
  }, [setAudioPlayingState])

  const submitVoiceTurn = useCallback(
    (wavBase64: string) => {
      const messageId = crypto.randomUUID()

      aiStreamingStartedRef.current = false
      audioStartedForTurnRef.current = false
      clearMinimizedVoiceCollapseTimer()
      clearFallbackSpeechTimer()
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
      setUserMessageImagePath,
    ],
  )

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
    enabled: voiceEnabled,
    onSpeechEnd: (wavBase64: string) => {
      const submitting = useSessionStore.getState().isSubmitting
      const isAssistantResponding =
        submitting ||
        aiStreamingStartedRef.current ||
        isAudioPlayingRef.current ||
        audioStreamActiveRef.current ||
        fallbackSpeechTimerRef.current !== null

      if (isAssistantResponding) {
        return
      }

      submitVoiceTurn(wavBase64)
    },
    onSpeechStart: () => {
      const submitting = useSessionStore.getState().isSubmitting
      const isAssistantSpeaking =
        isAudioPlayingRef.current ||
        audioStreamActiveRef.current ||
        fallbackSpeechTimerRef.current !== null
      const isAssistantStreaming = aiStreamingStartedRef.current && submitting

      if (submitting || isAssistantSpeaking || isAssistantStreaming) {
        return
      }
    },
  })

  lowerThresholdRef.current = lowerThreshold

  const isAssistantResponding =
    isSubmitting ||
    aiStreamingStartedRef.current ||
    isAudioPlaying ||
    audioStreamActiveRef.current ||
    fallbackSpeechTimerRef.current !== null
  const waveformPresentation = resolveWaveformPresentation({
    assistantAudioLevel,
    assistantWaveformBars,
    isAssistantSpeaking: isAudioPlaying,
    isProcessing: isSubmitting,
    isUserSpeaking,
    userAudioLevel,
    userWaveformBars,
  })
  const mode = screenState.kind === 'active-minimized' ? screenState.mode : 'expanded'

  useEffect(() => {
    if (!voiceEnabled || !isListening) {
      return
    }

    const shouldBeMuted = !vadListeningEnabled || isAssistantResponding
    if (isMuted === shouldBeMuted) {
      return
    }

    toggleMute()
  }, [
    isAssistantResponding,
    isListening,
    isMuted,
    toggleMute,
    vadListeningEnabled,
    voiceEnabled,
  ])

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

  const handleSetMode = useCallback(
    async (nextMode: Exclude<OverlayMode, 'expanded'>): Promise<void> => {
      clearMinimizedVoiceCollapseTimer()

      try {
        await window.api.setOverlayMode(nextMode)

        if (nextMode !== 'minimized-prompt-response') {
          clearLatestResponse()
        }

        transitionScreen({
          type: 'SHOW_MODE',
          mode: nextMode,
        })
      } catch (error) {
        console.error('[useActiveSessionController] Failed to set overlay mode:', error)
        void reconcileScreenStateFromMain()
      }
    },
    [
      clearLatestResponse,
      clearMinimizedVoiceCollapseTimer,
      reconcileScreenStateFromMain,
      transitionScreen,
    ],
  )

  useEffect(() => {
    const nextMode = getAutoAdvanceMinimizedVariant({
      errorMessage,
      isMinimizedPromptComposing: mode === 'minimized-prompt-input',
      latestResponseText,
      mode,
    })

    if (nextMode === null) {
      return
    }

    void window.api
      .setOverlayMode(nextMode)
      .catch(() => reconcileScreenStateFromMain())
    transitionScreen({
      type: 'SHOW_MODE',
      mode: nextMode,
    })
  }, [
    errorMessage,
    latestResponseText,
    mode,
    reconcileScreenStateFromMain,
    transitionScreen,
  ])

  useEffect(() => {
    const nextMode = getVoiceTurnCompleteVariant({
      errorMessage,
      hasResponseText: latestResponseText !== null && latestResponseText.trim().length > 0,
      isAudioPlaying,
      isSubmitting,
      mode,
    })

    clearMinimizedVoiceCollapseTimer()

    if (nextMode === null) {
      return
    }

    minimizedVoiceCollapseTimerRef.current = window.setTimeout(() => {
      minimizedVoiceCollapseTimerRef.current = null
      void handleSetMode(nextMode)
    }, MINIMIZED_VOICE_COLLAPSE_DELAY_MS)

    return () => {
      clearMinimizedVoiceCollapseTimer()
    }
  }, [
    clearMinimizedVoiceCollapseTimer,
    errorMessage,
    handleSetMode,
    isAudioPlaying,
    isSubmitting,
    latestResponseText,
    mode,
  ])

  useEffect(() => {
    window.api.onOverlayError((data) => {
      console.error('[useActiveSessionController] Overlay IPC error:', data.message)
      void reconcileScreenStateFromMain()
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
        console.debug(`[useActiveSessionController] TTS synthesis took ${data.ttsTime}s`)
      }
      if (audioSourceNodesRef.current.size === 0) {
        finishAudioPlayback()
      }
    })

    window.api.onSidecarDone(() => {
      aiStreamingStartedRef.current = false
      finishAssistantResponse()

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
      failAssistantResponse(data.message)
    })

    return () => {
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE)
      window.api.removeAllListeners(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR)
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
    reconcileScreenStateFromMain,
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

  const handleRestoreOverlay = useCallback(async (): Promise<void> => {
    clearMinimizedVoiceCollapseTimer()
    transitionScreen({ type: 'RESTORE' })
    try {
      await window.api.setOverlayMode('expanded')
    } catch (error) {
      console.error('[useActiveSessionController] Failed to restore overlay:', error)
      void reconcileScreenStateFromMain()
    }
  }, [clearMinimizedVoiceCollapseTimer, reconcileScreenStateFromMain, transitionScreen])

  const handleMinimizeOverlay = useCallback(async (): Promise<void> => {
    clearMinimizedVoiceCollapseTimer()
    const hasActiveResponse =
      errorMessage !== null ||
      (latestResponseText !== null && latestResponseText.trim().length > 0)
    const nextMode: Exclude<OverlayMode, 'expanded'> = hasActiveResponse
      ? 'minimized-prompt-response'
      : 'minimized-compact'
    transitionScreen({
      type: 'MINIMIZE',
      mode: nextMode,
    })

    try {
      if (nextMode === 'minimized-compact') {
        await window.api.setOverlayMode('minimized-compact')
        return
      }

      await window.api.setOverlayMode(nextMode)
    } catch (error) {
      console.error('[useActiveSessionController] Failed to minimize overlay:', error)
      void reconcileScreenStateFromMain()
    }
  }, [
    clearMinimizedVoiceCollapseTimer,
    errorMessage,
    latestResponseText,
    reconcileScreenStateFromMain,
    transitionScreen,
  ])

  const handleStopSession = useCallback(async (): Promise<void> => {
    const userMessageCount = messages.filter((message) => message.role === 'user').length
    const duration = sessionStartTime === null ? 0 : Date.now() - sessionStartTime
    const nextEndedSessionData: EndedSessionSnapshot = {
      sessionName,
      duration,
      messageCount: userMessageCount,
    }
    onBeginSessionEnd(nextEndedSessionData)

    clearMinimizedVoiceCollapseTimer()
    aiStreamingStartedRef.current = false
    audioStartedForTurnRef.current = false
    clearFallbackSpeechTimer()
    cancelSpeechSynthesis()
    stopScheduledAudioSources()
    stopAssistantWaveformLoop()
    resetAssistantWaveform()
    finishAudioPlayback()

    if (audioContextRef.current !== null) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    assistantGainNodeRef.current = null
    assistantAnalyserRef.current = null

    try {
      window.api.sidecarInterrupt()
    } catch (error) {
      console.error('[useActiveSessionController] Failed to interrupt sidecar:', error)
    }

    try {
      await window.api.stopSession()

      clearConversation()
      onSessionEndCommitted(nextEndedSessionData)
    } catch (error) {
      console.error('[useActiveSessionController] Failed to stop session:', error)
      void reconcileScreenStateFromMain()
    }
  }, [
    cancelSpeechSynthesis,
    clearConversation,
    clearFallbackSpeechTimer,
    clearMinimizedVoiceCollapseTimer,
    finishAudioPlayback,
    messages,
    onBeginSessionEnd,
    onSessionEndCommitted,
    reconcileScreenStateFromMain,
    resetAssistantWaveform,
    sessionName,
    sessionStartTime,
    stopAssistantWaveformLoop,
    stopScheduledAudioSources,
  ])

  const handleSubmitPrompt = useCallback(
    async (text: string): Promise<void> => {
      const trimmedText = text.trim()
      if (trimmedText.length === 0) {
        return
      }

      const messageId = crypto.randomUUID()

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
          console.error('[useActiveSessionController] Failed to interrupt audio:', error)
        }
      }

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
    },
    [
      beginPromptSubmission,
      cancelSpeechSynthesis,
      clearFallbackSpeechTimer,
      clearMinimizedVoiceCollapseTimer,
      failAssistantResponse,
      finishAudioPlayback,
      setUserMessageImagePath,
      stopScheduledAudioSources,
    ],
  )

  const handleAskAnother = useCallback(async (): Promise<void> => {
    clearMinimizedVoiceCollapseTimer()
    aiStreamingStartedRef.current = false
    audioStartedForTurnRef.current = false
    clearFallbackSpeechTimer()
    cancelSpeechSynthesis()
    stopScheduledAudioSources()
    stopAssistantWaveformLoop()
    resetAssistantWaveform()
    finishAudioPlayback()
    clearLatestResponse()
    await handleSetMode('minimized-prompt-input')
  }, [
    cancelSpeechSynthesis,
    clearFallbackSpeechTimer,
    clearLatestResponse,
    clearMinimizedVoiceCollapseTimer,
    finishAudioPlayback,
    handleSetMode,
    resetAssistantWaveform,
    stopAssistantWaveformLoop,
    stopScheduledAudioSources,
  ])

  return {
    errorMessage,
    handleAskAnother,
    handleMinimizeOverlay,
    handleRestoreOverlay,
    handleSetMode,
    handleStopSession,
    handleSubmitPrompt,
    isAudioPlaying,
    isListening,
    isMuted,
    isSubmitting,
    latestResponseText,
    messages,
    toggleVadListening,
    vadListeningEnabled,
    waveformState: waveformPresentation.state,
  }
}
