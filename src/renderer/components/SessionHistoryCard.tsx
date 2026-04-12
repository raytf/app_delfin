import { Clock3, MessageSquare, Trash2 } from 'lucide-react'
import type { SessionListItem } from '../../shared/types'

interface SessionHistoryCardProps {
  onClick?: () => void
  onDelete?: () => void
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
  onClick,
  onDelete,
  session,
  variant = 'compact',
}: SessionHistoryCardProps) {
  const isDetailed = variant === 'detailed'

  return (
    <article
      className={`group relative rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-sm transition hover:shadow-[0_18px_40px_rgba(20,129,186,0.08)] ${
        isDetailed ? 'p-6' : 'p-5'
      } ${onClick !== undefined ? 'cursor-pointer hover:border-[var(--primary)]' : ''}`}
      onClick={onClick}
    >
      {/* Delete button - appears on hover in top right */}
      {onDelete !== undefined ? (
        <button
          aria-label={`Delete ${session.sessionName || session.sourceLabel || 'session'}`}
          className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-0 shadow-sm transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          type="button"
        >
          <Trash2 size={14} />
        </button>
      ) : null}

      <div>
        <h3
          className={`font-display text-base font-semibold text-[var(--text-primary)] ${
            isDetailed ? '' : 'line-clamp-2'
          }`}
        >
          {session.sessionName || session.sourceLabel || 'Untitled Session'}
        </h3>
        {isDetailed ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {formatStatus(session.status)}
          </p>
        ) : null}
      </div>

      {isDetailed ? (
        <>
          <div className="mt-1">
            <div className="inline-block rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-medium text-[var(--primary)]">
              {formatRelativeTime(session.lastUpdatedAt)}
            </div>
          </div>
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
        </>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <MessageSquare size={14} className="text-[var(--primary)]" />
              <span className="font-medium">{session.messageCount}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <Clock3 size={14} className="text-[var(--primary)]" />
              <span className="font-medium">{formatDuration(session.startedAt, session.endedAt)}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            {formatRelativeTime(session.lastUpdatedAt)}
          </p>
        </>
      )}
    </article>
  )
}
