import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../shared/types'

interface SessionConversationProps {
  className?: string
  emptyMessage: string
  isSubmitting: boolean
  messages: ChatMessage[]
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
      <div className={`min-h-0 ${className ?? ''}`}>
        <div className="flex h-full min-h-0 items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-2)] px-5 text-center text-sm leading-6 text-[var(--text-muted)]">
          {emptyMessage}
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-0 ${className ?? ''}`}>
      <div className="flex h-full min-h-0 flex-col rounded-[1.5rem] border border-[var(--border-soft)] bg-[rgba(255,255,255,0.72)] p-3">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" ref={scrollContainerRef}>
          {messages.map((message) => {
            const isUser = message.role === 'user'

            return (
              <article
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                key={message.id}
              >
                <div
                  className={`max-w-[85%] rounded-[1.35rem] px-4 py-3 text-sm leading-6 shadow-lg ${
                    isUser
                      ? 'bg-[var(--primary)] text-white'
                      : 'border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[0_12px_28px_rgba(20,129,186,0.08)]'
                  }`}
                >
                  <p className={`text-[11px] uppercase tracking-[0.22em] ${isUser ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                    {isUser ? 'You' : 'Delfin'}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">
                    {message.content.length > 0 ? message.content : 'Thinking…'}
                  </p>
                  {isUser && message.imagePath !== undefined ? (
                    <button
                      className="mt-3 rounded-full border border-white/35 bg-white/12 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white transition hover:border-white/60 hover:bg-white/18"
                      disabled={loadingImageMessageId === message.id}
                      onClick={() => {
                        void handleViewCapture(message)
                      }}
                      type="button"
                    >
                      {loadingImageMessageId === message.id ? 'Loading…' : 'View Capture'}
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>
      {selectedImage !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(22,53,71,0.36)] px-6 py-10 backdrop-blur-sm">
          <div className="relative max-h-full w-full max-w-5xl overflow-hidden rounded-[2rem] border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-[0_28px_80px_rgba(22,53,71,0.22)]">
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Captured Context</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{selectedImage.text}</p>
              </div>
              <button
                className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                onClick={() => {
                  setSelectedImage(null)
                }}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-[var(--bg-surface-2)] p-6">
              <img
                alt="Captured screenshot for the selected prompt"
                className="mx-auto h-auto max-w-full rounded-2xl border border-[var(--border-soft)]"
                src={selectedImage.src}
              />
            </div>
          </div>
        </div>
      ) : null}
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
