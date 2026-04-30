import { useEffect, useRef, useState } from 'react'
import { Loader2, Pause, Play } from 'lucide-react'
import TextMessageBubble from './TextMessageBubble'

interface VoiceMessageBubbleProps {
  audioPath?: string
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export default function VoiceMessageBubble({
  audioPath,
}: VoiceMessageBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const isPlayable = audioPath !== undefined && audioPath !== 'pending'

  useEffect(() => {
    const audio = audioRef.current

    if (audio !== null) {
      audio.pause()
      audio.src = ''
    }

    setAudioSrc(null)
    setIsLoadingAudio(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [audioPath])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  async function loadAudioSource(): Promise<string | null> {
    if (audioPath === undefined || audioPath === 'pending') {
      return null
    }

    if (audioSrc !== null) {
      return audioSrc
    }

    setIsLoadingAudio(true)

    try {
      const nextSrc = await window.api.getSessionMessageAudio({
        audioPath,
      })
      setAudioSrc(nextSrc)
      return nextSrc
    } finally {
      setIsLoadingAudio(false)
    }
  }

  async function handleTogglePlayback(): Promise<void> {
    const nextSrc = await loadAudioSource()
    if (nextSrc === null) {
      return
    }

    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio

    audio.onloadedmetadata = () => {
      setDuration(audio.duration || 0)
    }
    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime)
    }
    audio.onended = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    audio.onpause = () => {
      setIsPlaying(false)
    }
    audio.onplay = () => {
      setIsPlaying(true)
    }

    audio.src = nextSrc

    if (audio.paused) {
      try {
        await audio.play()
      } catch (error) {
        console.error('[VoiceMessageBubble] Failed to play voice message:', error)
      }
      return
    }

    audio.pause()
  }

  return (
    <TextMessageBubble isUser showSpeakingLabel={false}>
      <div className="flex items-center gap-3">
        <button
          aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isPlayable || isLoadingAudio}
          onClick={() => {
            void handleTogglePlayback()
          }}
          type="button"
        >
          {isLoadingAudio ? (
            <Loader2 className="animate-spin" size={14} />
          ) : isPlaying ? (
            <Pause size={14} />
          ) : (
            <Play size={14} />
          )}
        </button>

        <div className="min-w-0">
          <p className="text-xs font-medium">Voice input</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>
        </div>

        {!isPlayable ? (
          <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Pending
          </span>
        ) : null}
      </div>
    </TextMessageBubble>
  )
}
