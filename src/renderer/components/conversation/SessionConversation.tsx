import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Layers3, Loader2, Pause, Play, User } from 'lucide-react'
import type { SessionMessage } from '../../../shared/entities/session'
import delfinLogo from '../../assets/logo-alt.png'
import ThinkingDots from './ThinkingDots'

interface SessionConversationProps {
  className?: string
  emptyMessage: string
  isAudioPlaying: boolean
  isSubmitting: boolean
  messages: SessionMessage[]
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

function DelfinAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)]">
      <img
        alt="Delfin"
        className="h-6 w-6 object-contain"
        src={delfinLogo}
      />
    </div>
  )
}

function UserAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-muted)]">
      <User size={16} />
    </div>
  )
}

function TextMessageBubble({
  children,
  isUser,
  showSpeakingLabel,
}: {
  children: ReactNode
  isUser: boolean
  showSpeakingLabel: boolean
}) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-[var(--primary)] text-white'
          : 'border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
      }`}
    >
      {showSpeakingLabel ? (
        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--primary)]">
          Speaking
        </p>
      ) : null}
      {children}
    </div>
  )
}

function VoiceMessageBubble({
  audioPath,
}: {
  audioPath?: string
}) {
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
        console.error('[SessionConversation] Failed to play voice message:', error)
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

export default function SessionConversation({
  className,
  emptyMessage,
  isAudioPlaying,
  isSubmitting,
  messages,
}: SessionConversationProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const latestAssistantIndex = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') {
        return index
      }
    }

    return -1
  })()
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [loadingImageMessageId, setLoadingImageMessageId] = useState<string | null>(null)

  useEffect(() => {
    const container = scrollContainerRef.current

    if (container === null) {
      return
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, isSubmitting])

  if (messages.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${className ?? ''}`}>
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)]">
            <img
              alt="Delfin"
              className="h-14 w-14 object-contain"
              src={delfinLogo}
            />
          </div>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            {emptyMessage}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <div
        className="flex-1 space-y-4 overflow-y-auto p-4"
        ref={scrollContainerRef}
      >
        {messages.map((message) => {
          const isUser = message.role === 'user'
          const isThinking = message.content.length === 0
          const isLatestAssistantMessage =
            !isUser &&
            isAudioPlaying &&
            latestAssistantIndex >= 0 &&
            messages[latestAssistantIndex]?.id === message.id
          const hasVoiceAudio = isUser && message.audioPath

          return (
            <article
              className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
              key={message.id}
            >
              {isUser ? <UserAvatar /> : <DelfinAvatar />}

              <div
                className={`flex max-w-[75%] flex-col ${
                  isUser ? 'items-end' : 'items-start'
                }`}
              >
                <span className="mb-1 text-xs text-[var(--text-muted)]">
                  {isUser ? 'You' : 'Delfin'}
                </span>

                {hasVoiceAudio ? (
                  <VoiceMessageBubble audioPath={message.audioPath} />
                ) : (
                  <TextMessageBubble
                    isUser={isUser}
                    showSpeakingLabel={isLatestAssistantMessage}
                  >
                    {isThinking ? (
                      <ThinkingDots size="sm" />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </TextMessageBubble>
                )}

                {isUser &&
                (message.imagePath !== undefined ||
                  message.imageDataUrl !== undefined) ? (
                  <button
                    className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    disabled={loadingImageMessageId === message.id}
                    onClick={() => {
                      void handleViewContext(message)
                    }}
                    type="button"
                  >
                    <Layers3 size={12} />
                    {loadingImageMessageId === message.id
                      ? 'Loading...'
                      : 'Context'}
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {selectedImage !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Question Context
              </p>
              <button
                className="cursor-pointer rounded-lg px-3 py-1 text-sm text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                onClick={() => setSelectedImage(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-[var(--bg-surface-2)] p-4">
              <img
                alt="Visual context for the selected question"
                className="mx-auto h-auto max-w-full rounded-lg"
                src={selectedImage}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  async function handleViewContext(message: SessionMessage): Promise<void> {
    if (message.imageDataUrl !== undefined) {
      setSelectedImage(message.imageDataUrl)
      return
    }

    if (message.imagePath === undefined) {
      return
    }

    setLoadingImageMessageId(message.id)

    try {
      const imageSrc = await window.api.getSessionMessageImage({
        imagePath: message.imagePath,
      })

      setSelectedImage(imageSrc)
    } finally {
      setLoadingImageMessageId(null)
    }
  }
}
