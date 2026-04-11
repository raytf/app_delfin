interface HomeScreenProps {
  onStartSession: () => void
}

export default function HomeScreen({ onStartSession }: HomeScreenProps) {
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
              This first screen is meant to stay frictionless. Later it can hold study history, saved sessions, and
              entry points into different workflows.
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
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">What Happens Next</p>
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
          </section>
        </main>
      </div>
    </div>
  )
}
