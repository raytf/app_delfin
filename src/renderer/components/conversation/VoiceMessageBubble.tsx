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
    let cancelled = false

    const audio = audioRef.current
    if (audio !== null) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }

    setAudioSrc(null)
    setIsLoadingAudio(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    if (!isPlayable || audioPath === undefined) {
      return () => {
        cancelled = true
      }
    }

    setIsLoadingAudio(true)

    void window.api
      .getSessionMessageAudio({
        audioPath,
      })
      .then((nextSrc) => {
        if (!cancelled) {
          setAudioSrc(nextSrc)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[VoiceMessageBubble] Failed to load voice message:', error)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAudio(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [audioPath, isPlayable])

  useEffect(() => {
    const audioSrcValue = audioSrc

    if (audioSrcValue === null) {
      return
    }

    const audio = audioRef.current ?? new Audio()
    audio.preload = 'metadata'
    audioRef.current = audio

    const handleLoadedMetadata = (): void => {
      setDuration(audio.duration || 0)
    }

    const handleTimeUpdate = (): void => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = (): void => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handlePause = (): void => {
      setIsPlaying(false)
    }

    const handlePlay = (): void => {
      setIsPlaying(true)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('play', handlePlay)
    audio.src = audioSrcValue
    audio.load()

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setDuration(audio.duration || 0)
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('play', handlePlay)
    }
  }, [audioSrc])

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

    const nextSrc = await window.api.getSessionMessageAudio({
      audioPath,
    })
    setAudioSrc(nextSrc)
    return nextSrc
  }

  async function handleTogglePlayback(): Promise<void> {
    const nextSrc = await loadAudioSource()
    if (nextSrc === null) {
      return
    }

    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio

    if (audio.src !== nextSrc) {
      audio.src = nextSrc
      audio.load()
    }

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
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isPlayable || isLoadingAudio}
          onClick={() => {
            void handleTogglePlayback()
          }}
          type="button"
        >
          {isLoadingAudio ? (
            <Loader2 className="animate-spin text-white" size={14} />
          ) : isPlaying ? (
            <Pause fill="currentColor" strokeWidth={0} className="text-white" size={15} />
          ) : (
            <Play fill="currentColor" strokeWidth={0} className="text-white" size={15} />
          )}
        </button>

        <div className="min-w-0 text-white">
          <p className="text-xs font-medium leading-none">
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>
        </div>

        {!isPlayable ? (
          <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-white/70">
            Pending
          </span>
        ) : null}
      </div>
    </TextMessageBubble>
  )
}
