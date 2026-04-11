interface ExpandedSessionSidebarProps {
  captureSourceLabel: string | null
  errorMessage: string | null
  onMinimize: () => void
  onStop: () => void
}

export default function ExpandedSessionSidebar({
  captureSourceLabel,
  errorMessage,
  onMinimize,
  onStop,
}: ExpandedSessionSidebarProps) {
  return (
    <aside className="flex flex-col gap-5">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/75 p-6 shadow-2xl shadow-black/20">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Session Controls</p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            onClick={onMinimize}
            type="button"
          >
            Minimize To Overlay
          </button>
          <button
            className="w-full rounded-2xl border border-red-500/40 px-4 py-3 text-sm font-medium text-red-200 transition hover:border-red-400 hover:text-white"
            onClick={onStop}
            type="button"
          >
            End Session
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 shadow-2xl shadow-black/20">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Current Capture</p>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          {captureSourceLabel ?? 'No frame captured yet. The next prompt will capture the foreground window.'}
        </p>
      </section>

      {errorMessage !== null ? (
        <section className="rounded-[2rem] border border-red-500/30 bg-red-500/10 p-6 shadow-2xl shadow-black/20">
          <p className="text-xs uppercase tracking-[0.28em] text-red-200">Latest Error</p>
          <p className="mt-4 text-sm leading-7 text-red-100">{errorMessage}</p>
        </section>
      ) : null}
    </aside>
  )
}
