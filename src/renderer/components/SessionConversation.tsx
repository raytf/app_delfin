import { useEffect, useRef } from 'react'
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

                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
