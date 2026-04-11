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
        <div className="flex h-full min-h-0 items-center justify-center rounded-[1.5rem] border border-dashed border-slate-800 bg-slate-950/40 px-5 text-center text-sm leading-6 text-slate-500">
          {emptyMessage}
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-0 ${className ?? ''}`}>
      <div className="flex h-full min-h-0 flex-col rounded-[1.5rem] border border-slate-800 bg-slate-950/40 p-3">
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
                      ? 'bg-cyan-400 text-slate-950'
                      : 'border border-slate-800 bg-slate-900/85 text-slate-100'
                  }`}
                >
                  <p className={`text-[11px] uppercase tracking-[0.22em] ${isUser ? 'text-slate-800/70' : 'text-slate-500'}`}>
                    {isUser ? 'You' : 'Copilot'}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">
                    {message.content.length > 0 ? message.content : 'Thinking…'}
                  </p>
                  {isUser && message.imagePath !== undefined ? (
                    <button
                      className="mt-3 rounded-full border border-slate-700 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-800/80 transition hover:border-slate-900 hover:text-slate-950"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6 py-10">
          <div className="relative max-h-full w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Captured Context</p>
                <p className="mt-2 text-sm text-slate-300">{selectedImage.text}</p>
              </div>
              <button
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
                onClick={() => {
                  setSelectedImage(null)
                }}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-slate-900/50 p-6">
              <img
                alt="Captured screenshot for the selected prompt"
                className="mx-auto h-auto max-w-full rounded-2xl border border-slate-800"
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
