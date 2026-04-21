import { ArrowLeft, Clock, Play, Trash2 } from 'lucide-react'
import type { ChatMessage, SessionListItem } from '../../shared/types'
import delfinLogo from '../assets/logo.png'
import SessionConversation from './SessionConversation'

interface PastSessionViewProps {
  messages: ChatMessage[]
  onBack: () => void
  onDelete: () => void
  onResume: () => void
  session: SessionListItem
}

function formatDuration(startedAt: number, endedAt: number | null, priorDurationMs = 0): string {
  const end = endedAt ?? Date.now()
  const durationMs = end - startedAt + priorDurationMs
  const minutes = Math.floor(durationMs / 60000)
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60

  if (hours > 0) {
    return `${hours}h ${remainingMins}m`
  }

  return `${minutes}m`
}

function formatSessionDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(timestamp))
}

export default function PastSessionView({
  messages,
  onBack,
  onDelete,
  onResume,
  session,
}: PastSessionViewProps) {
  const sessionName = session.sessionName || session.sourceLabel || 'Untitled Session'

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-soft)] bg-[var(--bg-surface)] px-6 py-5">
        <div className="relative flex items-center justify-center">
          <div className="absolute left-0 flex items-center gap-3">
            <button
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              onClick={onBack}
              type="button"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-red-200 bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
              onClick={onDelete}
              type="button"
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>

          <div className="flex items-center justify-center gap-3">
            <img
              alt="Delfin logo"
              className="h-14 w-14 object-contain"
              src={delfinLogo}
            />
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--primary)]">
              Delfin
            </h1>
          </div>

          <div className="absolute right-0">
            <button
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
              onClick={onResume}
              type="button"
            >
              <Play size={15} />
              Continue Session
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col border-r border-[var(--border-soft)]">
          <div className="min-h-0 flex-1 overflow-hidden">
            <SessionConversation
              className="h-full"
              emptyMessage="No conversation was saved for this session."
              isSubmitting={false}
              messages={messages}
            />
          </div>
        </main>

        <aside className="flex w-[21rem] shrink-0 flex-col bg-[var(--bg-app-soft)] p-6">
          <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-[var(--text-primary)]">
            {sessionName}
          </h2>
          <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
            <Clock size={16} />
            <span className="font-medium">{formatDuration(session.startedAt, session.endedAt, session.priorDurationMs)}</span>
          </div>

          <div className="mt-5 rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Session Details
            </p>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-[var(--text-muted)]">Messages</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)]">{session.messageCount}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Started</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)]">
                  {formatSessionDate(session.startedAt)}
                </dd>
              </div>
              {session.endedAt !== null ? (
                <div>
                  <dt className="text-[var(--text-muted)]">Ended</dt>
                  <dd className="mt-1 font-medium text-[var(--text-primary)]">
                    {formatSessionDate(session.endedAt)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}
