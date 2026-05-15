/**
 * useVAD — wraps the locally hosted vad-web MicVAD runtime for always-on
 * voice detection.
 *
 * When `enabled` is true the hook initialises a MicVAD instance on mount and
 * destroys it on unmount.  When the user finishes speaking, `onSpeechEnd` is
 * called with a base64-encoded WAV string ready to be sent to the sidecar.
 *
 * Barge-in protection (two layers):
 *   1. `raiseThreshold()` lifts positiveSpeechThreshold 0.50 → 0.92 while the
 *      AI is speaking, making accidental triggers much harder.
 *   2. A BARGE_IN_GRACE_MS window starts when `raiseThreshold()` is called;
 *      any `onSpeechStart` events fired during that window are silently dropped,
 *      preventing the mic from picking up the AI's own TTS voice.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { float32ToWavBase64 } from '../../../utils/audioUtils'
import {
  createWaveformBars,
  getWaveformActivityLevel,
  reduceFrequencyDataToWaveformBars,
  smoothWaveformBars,
  WAVEFORM_BAR_COUNT,
  type WaveformBars,
} from '../../../utils/waveformState'

const POSITIVE_SPEECH_THRESHOLD_NORMAL = 0.5
const POSITIVE_SPEECH_THRESHOLD_BARGE_IN = 0.92
// Silero authors recommend negativeSpeechThreshold = positiveSpeechThreshold − 0.15
const NEGATIVE_DELTA = 0.15
const BARGE_IN_GRACE_MS = 800

function getVadRuntimeBaseUrl(): string {
  return new URL('./vad-runtime/', document.baseURI).href
}

export interface UseVADOptions {
  /** Set to false to skip initialisation entirely (VOICE_ENABLED=false). */
  enabled: boolean
  /** Called on every speech segment with a base64 WAV (16 kHz, 16-bit mono). */
  onSpeechEnd: (wavBase64: string) => void
  /** Optional: called when the VAD detects speech has started. */
  onSpeechStart?: () => void
}

export interface UseVADReturn {
  /** True once the MicVAD instance is running and listening. */
  isListening: boolean
  /** True while the VAD is inside an active detected speech segment. */
  isUserSpeaking: boolean
  /** True if the user has manually muted the mic via toggleMute(). */
  isMuted: boolean
  /** Smoothed microphone activity level, normalized to 0..1 during speech. */
  userAudioLevel: number
  /** Smoothed per-bar microphone waveform data for renderer-local visualisation. */
  userWaveformBars: WaveformBars
  /** Toggle mic on/off without destroying the VAD instance. */
  toggleMute: () => void
  /**
   * Raise the speech threshold to 0.92 and start the barge-in grace window.
   * Call this when audio playback begins (onSidecarAudioStart).
   */
  raiseThreshold: () => void
  /**
   * Lower the speech threshold back to 0.50.
   * Call this when audio playback ends (onSidecarAudioEnd).
   */
  lowerThreshold: () => void
}

export function useVAD({ enabled, onSpeechEnd, onSpeechStart }: UseVADOptions): UseVADReturn {
  const [isListening, setIsListening] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [userAudioLevel, setUserAudioLevel] = useState(0)
  const [userWaveformBars, setUserWaveformBars] = useState<WaveformBars>(() => createWaveformBars())

  const vadRef = useRef<VadMicVADInstance | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inGracePeriodRef = useRef(false)
  const levelAnimationFrameRef = useRef<number | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const smoothedLevelRef = useRef(0)
  const isMutedRef = useRef(false)
  const userWaveformBarsRef = useRef<number[]>(createWaveformBars())
  const waveformFrequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  // Keep callback refs current so we never need to recreate the VAD instance
  // just because the parent re-rendered with a new inline function.
  const onSpeechEndRef = useRef(onSpeechEnd)
  const onSpeechStartRef = useRef(onSpeechStart)
  useEffect(() => { onSpeechEndRef.current = onSpeechEnd }, [onSpeechEnd])
  useEffect(() => { onSpeechStartRef.current = onSpeechStart }, [onSpeechStart])
  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])

  const resetUserWaveform = useCallback(() => {
    const emptyBars = createWaveformBars(WAVEFORM_BAR_COUNT)
    userWaveformBarsRef.current = emptyBars
    waveformFrequencyDataRef.current = null
    smoothedLevelRef.current = 0
    setUserWaveformBars(emptyBars)
    setUserAudioLevel(0)
  }, [])

  const stopUserLevelLoop = useCallback(() => {
    if (levelAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(levelAnimationFrameRef.current)
      levelAnimationFrameRef.current = null
    }
  }, [])

  const startUserLevelLoop = useCallback(() => {
    if (levelAnimationFrameRef.current !== null) {
      return
    }

    const sample = () => {
      const analyser = analyserRef.current
      if (analyser === null) {
        stopUserLevelLoop()
        resetUserWaveform()
        return
      }

      let nextBars: WaveformBars

      if (isMutedRef.current) {
        nextBars = smoothWaveformBars(userWaveformBarsRef.current, createWaveformBars(WAVEFORM_BAR_COUNT), {
          attack: 0.22,
          release: 0.24,
        })
      } else {
        if (waveformFrequencyDataRef.current === null || waveformFrequencyDataRef.current.length !== analyser.frequencyBinCount) {
          waveformFrequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount)
        }

        analyser.getByteFrequencyData(waveformFrequencyDataRef.current)
        const reducedBars = reduceFrequencyDataToWaveformBars(waveformFrequencyDataRef.current, WAVEFORM_BAR_COUNT)
        nextBars = smoothWaveformBars(userWaveformBarsRef.current, reducedBars, {
          attack: 0.4,
          release: 0.16,
        })
      }

      const nextLevel = getWaveformActivityLevel(nextBars)
      userWaveformBarsRef.current = [...nextBars]
      smoothedLevelRef.current = nextLevel
      setUserWaveformBars(userWaveformBarsRef.current)
      setUserAudioLevel(nextLevel)
      levelAnimationFrameRef.current = window.requestAnimationFrame(sample)
    }

    levelAnimationFrameRef.current = window.requestAnimationFrame(sample)
  }, [resetUserWaveform, stopUserLevelLoop])

  useEffect(() => {
    if (!enabled) return

    let destroyed = false

    const cleanupAudioResources = (): void => {
      stopUserLevelLoop()
      resetUserWaveform()
      for (const track of micStreamRef.current?.getTracks() ?? []) {
        track.stop()
      }
      if (micSourceRef.current !== null) {
        micSourceRef.current.disconnect()
        micSourceRef.current = null
      }
      if (audioContextRef.current !== null) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }
      analyserRef.current = null
      micStreamRef.current = null
      setIsUserSpeaking(false)
    }

    async function init(): Promise<void> {
      try {
        const vadRuntime = window.vad
        if (window.ort == null) {
          throw new Error('window.ort is unavailable. Check ./vad-runtime/ort.wasm.min.js.')
        }
        if (vadRuntime?.MicVAD == null) {
          throw new Error('window.vad.MicVAD is unavailable. Check ./vad-runtime/bundle.min.js.')
        }

        const runtimeBaseUrl = getVadRuntimeBaseUrl()
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        const audioContext = new AudioContext()
        if (audioContext.state === 'suspended') {
          await audioContext.resume().catch(() => undefined)
        }
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.76

        const micSource = audioContext.createMediaStreamSource(micStream)
        micSource.connect(analyser)

        micStreamRef.current = micStream
        audioContextRef.current = audioContext
        analyserRef.current = analyser
        micSourceRef.current = micSource

        const vad = await vadRuntime.MicVAD.new({
          getStream: async () => micStream,
          model: 'v5',
          // Follow the upstream browser contract closely: serve the VAD worklet,
          // ONNX model, and ORT wasm/mjs files from one absolute base URL. Using
          // a fully-qualified URL avoids duplicated relative-path resolution like
          // /vad-runtime/vad-runtime/... in dev while also working under file://.
          baseAssetPath: runtimeBaseUrl,
          onnxWASMBasePath: runtimeBaseUrl,
          positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD_NORMAL,
          negativeSpeechThreshold: POSITIVE_SPEECH_THRESHOLD_NORMAL - NEGATIVE_DELTA,
          preSpeechPadMs: 300,
          minSpeechMs: 250,

          onSpeechStart: () => {
            if (inGracePeriodRef.current) {
              console.debug('[useVAD] onSpeechStart suppressed by grace period')
              return
            }
            console.debug('[useVAD] onSpeechStart fired')
            setIsUserSpeaking(true)
            onSpeechStartRef.current?.()
          },

          onSpeechEnd: (audio: Float32Array) => {
            if (inGracePeriodRef.current) return
            setIsUserSpeaking(false)
            const wavBase64 = float32ToWavBase64(audio)
            onSpeechEndRef.current(wavBase64)
          },

          onVADMisfire: () => {
            // Speech too short — ignore silently
          },
        })

        if (destroyed) {
          await vad.destroy()
          return
        }

        vadRef.current = vad
        await vad.start()
        startUserLevelLoop()
        setIsListening(true)
      } catch (err) {
        cleanupAudioResources()
        console.error('[useVAD] Failed to initialise MicVAD:', err)
      }
    }

    void init()

    return () => {
      destroyed = true
      if (graceTimerRef.current !== null) {
        clearTimeout(graceTimerRef.current)
        graceTimerRef.current = null
      }
      vadRef.current?.destroy().catch(() => undefined)
      cleanupAudioResources()
      vadRef.current = null
      setIsListening(false)
    }
  }, [enabled, resetUserWaveform, startUserLevelLoop, stopUserLevelLoop])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      if (vadRef.current !== null) {
        if (next) {
          stopUserLevelLoop()
          setIsUserSpeaking(false)
          resetUserWaveform()
          void vadRef.current.pause()
        } else {
          void vadRef.current.start()
          startUserLevelLoop()
        }
      }
      return next
    })
  }, [resetUserWaveform, startUserLevelLoop, stopUserLevelLoop])

  const raiseThreshold = useCallback(() => {
    vadRef.current?.setOptions({
      positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD_BARGE_IN,
      negativeSpeechThreshold: POSITIVE_SPEECH_THRESHOLD_BARGE_IN - NEGATIVE_DELTA,
    })
    // Start grace period — suppress onSpeechStart for BARGE_IN_GRACE_MS
    inGracePeriodRef.current = true
    if (graceTimerRef.current !== null) clearTimeout(graceTimerRef.current)
    graceTimerRef.current = setTimeout(() => {
      inGracePeriodRef.current = false
      graceTimerRef.current = null
    }, BARGE_IN_GRACE_MS)
  }, [])

  const lowerThreshold = useCallback(() => {
    vadRef.current?.setOptions({
      positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD_NORMAL,
      negativeSpeechThreshold: POSITIVE_SPEECH_THRESHOLD_NORMAL - NEGATIVE_DELTA,
    })
    // Also clear grace period so subsequent onSpeechStart events are not suppressed.
    if (graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current)
      graceTimerRef.current = null
    }
    inGracePeriodRef.current = false
  }, [])

  return {
    isListening,
    isUserSpeaking,
    isMuted,
    userAudioLevel,
    userWaveformBars,
    toggleMute,
    raiseThreshold,
    lowerThreshold,
  }
}
