import { Clock3, MessageSquare } from 'lucide-react'
import type { SessionListItem } from '../../shared/types'

interface SessionHistoryCardProps {
  session: SessionListItem
  variant?: 'compact' | 'detailed'
}

function formatDuration(startedAt: number, endedAt: number | null): string {
  const end = endedAt ?? Date.now()
  const durationMs = end - startedAt
  const minutes = Math.floor(durationMs / 60000)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return `${hours}h ${remainingMins}m`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatStatus(status: SessionListItem['status']): string {
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Ended with issue'
  if (status === 'aborted') return 'Stopped early'
  return 'In progress'
}

export default function SessionHistoryCard({
  session,
  variant = 'compact',
}: SessionHistoryCardProps) {
  const isDetailed = variant === 'detailed'

  return (
    <article
      className={`rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-sm transition hover:shadow-[0_18px_40px_rgba(20,129,186,0.08)] ${
        isDetailed ? 'p-6' : 'p-5'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
            {session.sourceLabel ?? 'Untitled Session'}
          </h3>
          {isDetailed ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {formatStatus(session.status)}
            </p>
          ) : null}
        </div>

        {isDetailed ? (
          <div className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-medium text-[var(--primary)]">
            {formatRelativeTime(session.lastUpdatedAt)}
          </div>
        ) : null}
      </div>

      {isDetailed ? (
        <div className="mt-5 grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-3">
          <div className="rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <MessageSquare size={14} />
              <span>Messages</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
              {session.messageCount}
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Clock3 size={14} />
              <span>Duration</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
              {formatDuration(session.startedAt, session.endedAt)}
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3">
            <p className="text-[var(--text-muted)]">Started</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
              {formatDate(session.startedAt)}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-4 text-sm text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <MessageSquare size={14} />
              <span>{session.messageCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock3 size={14} />
              <span>{formatDuration(session.startedAt, session.endedAt)}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {formatRelativeTime(session.lastUpdatedAt)}
          </p>
        </>
      )}
    </article>
  )
}
