import { ArrowLeft, Sparkles } from 'lucide-react'
import type { SessionListItem } from '../../shared/types'
import SessionHistoryCard from './SessionHistoryCard'

interface AllSessionsPageProps {
  onBack: () => void
  onDeleteSession: (sessionId: string) => void
  onSelectSession: (sessionId: string) => void
  sessions: SessionListItem[]
}

export default function AllSessionsPage({
  onBack,
  onDeleteSession,
  onSelectSession,
  sessions,
}: AllSessionsPageProps) {
  return (
    <div className="ocean-gradient relative min-h-screen text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-8 py-10">
        <header className="flex items-start justify-between gap-6">
          <div>
            <button
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              onClick={onBack}
              type="button"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--text-primary)]">
              All Sessions
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
              Browse your previous sessions with Delfin and keep a clear sense of what you worked through over time.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-5 py-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Total Sessions
            </p>
            <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{sessions.length}</p>
          </div>
        </header>

        <main className="mt-8 flex-1">
          {sessions.length === 0 ? (
            <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-[2rem] border border-dashed border-[var(--border-soft)] bg-[var(--bg-surface)]/70 px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                <Sparkles size={28} />
              </div>
              <h2 className="mt-5 font-display text-2xl font-semibold text-[var(--text-primary)]">
                No sessions yet
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                Start a session with Delfin and your study history will appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sessions.map((session) => (
                <SessionHistoryCard
                  key={session.id}
                  onDelete={() => {
                    onDeleteSession(session.id)
                  }}
                  onClick={() => {
                    onSelectSession(session.id)
                  }}
                  session={session}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
