import { ArrowLeft, Clock, Trash2 } from 'lucide-react'
import type { ChatMessage, SessionListItem } from '../../shared/types'
import SessionConversation from './SessionConversation'

interface PastSessionViewProps {
  messages: ChatMessage[]
  onBack: () => void
  onDelete: () => void
  session: SessionListItem
}

function formatDuration(startedAt: number, endedAt: number | null): string {
  const end = endedAt ?? Date.now()
  const durationMs = end - startedAt
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
  session,
}: PastSessionViewProps) {
  const sessionName = session.sessionName || session.sourceLabel || 'Untitled Session'

  return (
    <div className="flex h-full flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
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
          <div className="flex flex-col gap-2.5">
            <button
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              onClick={onBack}
              type="button"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--danger)]/85"
              onClick={onDelete}
              type="button"
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>

          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            Session
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold leading-tight text-[var(--text-primary)]">
            {sessionName}
          </h2>
          <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
            <Clock size={16} />
            <span className="font-medium">{formatDuration(session.startedAt, session.endedAt)}</span>
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
