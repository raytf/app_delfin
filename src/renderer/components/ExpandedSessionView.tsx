import { useEffect, useState } from 'react'
import { Minimize2, Square, MessageCircle, Clock } from 'lucide-react'
import type { ChatMessage } from '../../shared/types'
import delfinLogo from '../assets/logo.png'
import { useSessionStore } from '../stores/sessionStore'
import SessionConversation from './SessionConversation'

interface ExpandedSessionViewProps {
  captureSourceLabel: string | null
  errorMessage: string | null
  isSubmitting: boolean
  messages: ChatMessage[]
  onMinimize: () => void
  onAskDelfin: () => void
  onStop: () => void
}

function formatElapsedTime(startTime: number | null): string {
  if (startTime === null) return '0:00'

  const elapsed = Math.floor((Date.now() - startTime) / 1000)
  const hours = Math.floor(elapsed / 3600)
  const minutes = Math.floor((elapsed % 3600) / 60)
  const seconds = elapsed % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function SessionTimer({ startTime }: { startTime: number | null }) {
  const [elapsed, setElapsed] = useState(formatElapsedTime(startTime))

  useEffect(() => {
    if (startTime === null) return

    const interval = setInterval(() => {
      setElapsed(formatElapsedTime(startTime))
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <Clock size={16} />
      <span className="font-medium tabular-nums">{elapsed}</span>
    </div>
  )
}

export default function ExpandedSessionView({
  captureSourceLabel,
  errorMessage,
  isSubmitting,
  messages,
  onMinimize,
  onAskDelfin,
  onStop,
}: ExpandedSessionViewProps) {
  const sessionStartTime = useSessionStore((state) => state.sessionStartTime)
  const sessionName = captureSourceLabel ?? 'Study Session'

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-soft)] bg-[var(--bg-surface)] px-6 py-2 text-center">
        <div className="flex items-center justify-center">
          <img
            alt="Delfin logo"
            className="h-16 w-16 object-contain"
            src={delfinLogo}
          />
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--primary)]">
            Delfin
          </h1>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col border-r border-[var(--border-soft)]">
          <div className="min-h-0 flex-1 overflow-hidden">
            <SessionConversation
              className="h-full"
              emptyMessage="Start a conversation with Delfin."
              isSubmitting={isSubmitting}
              messages={messages}
            />
          </div>

          <div className="border-t border-[var(--border-soft)] bg-[var(--bg-surface)] p-4">
            <button
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
              onClick={onAskDelfin}
              type="button"
            >
              <MessageCircle size={18} />
              Ask Delfin
            </button>
          </div>
        </main>

        <aside className="flex w-[21rem] shrink-0 flex-col bg-[var(--bg-app-soft)] p-6">
          <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-[var(--text-primary)]">
            {sessionName}
          </h2>
          <div className="mt-4 inline-flex w-fit rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3">
            <SessionTimer startTime={sessionStartTime} />
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <button
              aria-label="Minimize to overlay"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              onClick={onMinimize}
              type="button"
            >
              <Minimize2 size={16} />
              Minimize
            </button>
            <button
              aria-label="End session"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--danger)]/80"
              onClick={onStop}
              type="button"
            >
              <Square size={14} fill="currentColor" />
              End Session
            </button>
          </div>

          {errorMessage !== null ? (
            <div className="mt-4 rounded-[1.75rem] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5">
              <h2 className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--danger)]">
                Error
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--danger)]">
                {errorMessage}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
