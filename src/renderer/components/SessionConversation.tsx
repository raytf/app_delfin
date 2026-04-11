import { useEffect, useRef, useState } from 'react'
import { User, Layers3 } from 'lucide-react'
import type { ChatMessage } from '../../shared/types'
import delfinLogo from '../assets/logo-alt.png'

interface SessionConversationProps {
  className?: string
  emptyMessage: string
  isSubmitting: boolean
  messages: ChatMessage[]
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

export default function SessionConversation({
  className,
  emptyMessage,
  isSubmitting,
  messages,
}: SessionConversationProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [selectedImage, setSelectedImage] = useState<{ src: string; text: string } | null>(null)
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

          return (
            <article
              className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
              key={message.id}
            >
              {isUser ? <UserAvatar /> : <DelfinAvatar />}

              <div className={`flex max-w-[75%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <span className="mb-1 text-xs text-[var(--text-muted)]">
                  {isUser ? 'You' : 'Delfin'}
                </span>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-[var(--primary)] text-white'
                      : 'border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                  }`}
                >
                  {isThinking ? (
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-60" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-60 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current opacity-60 [animation-delay:300ms]" />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>

                {isUser && message.imagePath !== undefined && (
                  <button
                    className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    disabled={loadingImageMessageId === message.id}
                    onClick={() => {
                      void handleViewCapture(message)
                    }}
                    type="button"
                  >
                    <Layers3 size={12} />
                    {loadingImageMessageId === message.id ? 'Loading...' : 'Context'}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* Image Modal */}
      {selectedImage !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">Question Context</p>
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
                src={selectedImage.src}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )

  async function handleViewCapture(message: ChatMessage): Promise<void> {
    if (message.imagePath === undefined) {
      return
    }

    setLoadingImageMessageId(message.id)

    try {
      const imageSrc = await window.api.getSessionMessageImage({
        imagePath: message.imagePath,
      })

      setSelectedImage({
        src: imageSrc,
        text: message.content,
      })
    } finally {
      setLoadingImageMessageId(null)
    }
  }
}
