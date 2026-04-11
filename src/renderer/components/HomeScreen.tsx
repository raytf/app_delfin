import type { SessionListItem } from '../../shared/types'

interface HomeScreenProps {
  onStartSession: () => void
  sessions: SessionListItem[]
}

function formatDate(timestamp: number | null): string {
  if (timestamp === null) {
    return 'In progress'
  }

  return new Date(timestamp).toLocaleString()
}

export default function HomeScreen({ onStartSession, sessions }: HomeScreenProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_36%),linear-gradient(180deg,_#0f172a_0%,_#020617_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-between px-8 py-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-400">Screen Copilot</p>
            <p className="mt-2 text-sm text-slate-400">Local, on-device screen understanding for study sessions.</p>
          </div>
          <div className="rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-400">
            Session-free home
          </div>
        </header>

        <main className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr] lg:items-end">
          <section className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.28em] text-emerald-400">Home</p>
            <h1 className="mt-5 text-5xl font-semibold leading-tight text-white">
              Open the app, start a session, then let it drop into overlay mode.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Start a new session fast, or look back at recent study runs when there is no active session open.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <button
                className="rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                onClick={onStartSession}
                type="button"
              >
                Start Session
              </button>
              <p className="text-sm text-slate-400">Starts the session and minimizes into the overlay.</p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 shadow-2xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              {sessions.length > 0 ? 'Recent Sessions' : 'What Happens Next'}
            </p>
            {sessions.length > 0 ? (
              <div className="mt-6 space-y-3">
                {sessions.map((session) => (
                  <div
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300"
                    key={session.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{session.sourceLabel ?? 'Unnamed session'}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{session.status}</p>
                      </div>
                      <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                        {session.messageCount} messages
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">Started {formatDate(session.startedAt)}</p>
                    <p className="mt-1 text-sm text-slate-500">Ended {formatDate(session.endedAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 space-y-4 text-sm text-slate-300">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  1. Session starts from this home screen.
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  2. The app collapses into a compact always-on-top overlay.
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  3. Later, user prompts will trigger on-demand capture and sidecar analysis.
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
