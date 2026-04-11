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
      <section className="rounded-[2rem] border border-[var(--border-soft)] bg-[var(--bg-overlay)] p-6 shadow-[0_24px_60px_var(--shadow-tint)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Session Controls</p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            className="w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
            onClick={onMinimize}
            type="button"
          >
            Minimize To Overlay
          </button>
          <button
            className="w-full rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)] transition hover:border-[var(--danger)] hover:bg-[#fbd5d5]"
            onClick={onStop}
            type="button"
          >
            End Session
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-[var(--border-soft)] bg-[var(--bg-overlay)] p-6 shadow-[0_24px_60px_var(--shadow-tint)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Current Capture</p>
        <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
          {captureSourceLabel ?? 'No frame captured yet. The next prompt will capture the foreground window.'}
        </p>
      </section>

      {errorMessage !== null ? (
        <section className="rounded-[2rem] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-6 shadow-[0_18px_40px_rgba(201,92,92,0.12)]">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--danger)]">Latest Error</p>
          <p className="mt-4 text-sm leading-7 text-[var(--danger)]">{errorMessage}</p>
        </section>
      ) : null}
    </aside>
  )
}
