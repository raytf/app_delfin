import { useEffect, useRef, useState } from 'react'
import { Layers3 } from 'lucide-react'
import type { SessionMessage } from '../../../shared/entities/session'
import Avatar from './Avatar'
import TextMessageBubble from './TextMessageBubble'
import VoiceMessageBubble from './VoiceMessageBubble'
import delfinLogo from '../../assets/logo-alt.png'
import ThinkingDots from './ThinkingDots'

interface SessionConversationProps {
  className?: string
  emptyMessage: string
  isAudioPlaying: boolean
  isSubmitting: boolean
  messages: SessionMessage[]
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
              <Avatar variant={isUser ? 'user' : 'delfin'} />

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
