import type { ReactNode } from 'react'

interface TextMessageBubbleProps {
  children: ReactNode
  isUser: boolean
  showSpeakingLabel: boolean
}

export default function TextMessageBubble({
  children,
  isUser,
  showSpeakingLabel,
}: TextMessageBubbleProps) {
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
