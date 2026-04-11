interface ExpandedSessionViewProps {
  onMinimize: () => void
  onStop: () => void
}

export default function ExpandedSessionView({ onMinimize, onStop }: ExpandedSessionViewProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#0f172a_0%,_#020617_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-8 py-10">
        <div className="flex items-start justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-400">Session Active</p>
            <h1 className="mt-4 text-4xl font-semibold">Expanded workspace</h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              This view is intentionally light for now. Later it will hold streamed responses, response cards, and the
              audio interaction surface while the session stays active.
            </p>
          </div>
          <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
            Session active
          </div>
        </div>

        <div className="mt-10 grid flex-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 shadow-2xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Reserved Space</p>
            <div className="mt-6 flex h-[320px] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-700 bg-slate-900/60 text-center text-sm leading-7 text-slate-400">
              Response panels and study-specific session UI will live here.
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 shadow-2xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Session Actions</p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                onClick={onMinimize}
                type="button"
              >
                Minimize
              </button>
              <button
                className="w-full rounded-2xl border border-red-500/40 px-4 py-3 text-sm font-medium text-red-200 transition hover:border-red-400 hover:text-white"
                onClick={onStop}
                type="button"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
