import type { SessionListItem } from '../../shared/types'

interface HomeScreenProps {
  onStartSession: () => void
  sessions: SessionListItem[]
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

// Dolphin wave SVG for decorative element
function WaveDecoration() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden opacity-60">
      <svg
        className="absolute -top-1/2 left-1/2 w-[200%] -translate-x-1/2"
        viewBox="0 0 1200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path
          d="M0 100 Q150 50 300 100 T600 100 T900 100 T1200 100 V0 H0 Z"
          fill="url(#wave-gradient)"
        />
        <defs>
          <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--ocean-bright)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--ocean-bright)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

export default function HomeScreen({ onStartSession, sessions }: HomeScreenProps) {
  const recentSessions = sessions.slice(0, 6)

  return (
    <div className="ocean-gradient relative min-h-screen text-[var(--text-primary)]">
      <WaveDecoration />

      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col px-8 py-12">
        {/* Hero Section - Centered */}
        <main className="flex flex-1 flex-col items-center justify-center pb-8 pt-4 text-center">
          {/* Title */}
          <h1 className="font-display text-8xl font-bold tracking-tight text-[var(--primary)]">
            Delfin
          </h1>

          {/* Tagline */}
          <p className="mt-6 max-w-xl text-xl leading-relaxed text-[var(--text-secondary)]">
            Your intelligent study companion that sees what you see.
            <br />
            <span className="text-[var(--text-muted)]">
              Ask questions, get explanations, and learn faster together.
            </span>
          </p>

          {/* Start Session Button */}
          <button
            className="btn-ocean mt-8 cursor-pointer rounded-2xl px-8 py-4 text-base font-semibold text-white shadow-lg"
            onClick={onStartSession}
            type="button"
          >
            Start Studying
          </button>
        </main>

        {/* Recent Sessions Section */}
        <section className="pb-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Continue Studying
            </h2>
            {sessions.length > 6 && (
              <button
                className="text-sm font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
                type="button"
              >
                View All Sessions
              </button>
            )}
          </div>

          {recentSessions.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentSessions.map((session) => (
                <div
                  className="session-card cursor-pointer rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 shadow-sm"
                  key={session.id}
                >
                  {/* Session Title */}
                  <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {session.sourceLabel ?? 'Untitled Session'}
                  </h3>

                  {/* Session Meta */}
                  <div className="mt-4 flex items-center gap-4 text-sm text-[var(--text-muted)]">
                    {/* Message Count */}
                    <div className="flex items-center gap-1.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                        />
                      </svg>
                      <span>{session.messageCount}</span>
                    </div>

                    {/* Duration */}
                    <div className="flex items-center gap-1.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>{formatDuration(session.startedAt, session.endedAt)}</span>
                    </div>
                  </div>

                  {/* Time ago */}
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    {formatRelativeTime(session.lastUpdatedAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--bg-surface)]/50 p-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]">
                <svg
                  className="h-7 w-7 text-[var(--primary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
              </div>
              <p className="font-display text-base font-medium text-[var(--text-secondary)]">
                Ready to dive in?
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Your study sessions will appear here
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
