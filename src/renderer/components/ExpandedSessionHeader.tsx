import type { ChatMessage, SidecarStatus } from '../../shared/types'

interface ExpandedSessionHeaderProps {
  messages: ChatMessage[]
  sidecarStatus: SidecarStatus
}

export default function ExpandedSessionHeader({
  messages,
  sidecarStatus,
}: ExpandedSessionHeaderProps) {
  const promptCount = messages.filter((message) => message.role === 'user').length

  return (
    <header className="flex flex-col gap-6 rounded-[2rem] border border-[var(--border-soft)] bg-[linear-gradient(135deg,_rgba(255,255,255,0.94),_rgba(214,238,248,0.92))] p-7 shadow-[0_24px_60px_var(--shadow-tint)] lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.34em] text-[var(--primary)]">Delfin Session</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-[var(--text-primary)]">
          Your live study thread stays here while Delfin floats beside your work.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
          Use the expanded view for context, follow-up questions, and reviewing what you and Delfin worked through together.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-[rgba(255,255,255,0.75)] px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Prompts</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{promptCount}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">messages sent in this session</p>
        </div>
        <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-[rgba(255,255,255,0.75)] px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Sidecar</p>
          <p className={`mt-2 text-sm font-semibold ${sidecarStatus.connected ? 'text-[var(--accent-teal)]' : 'text-[var(--danger)]'}`}>
            {sidecarStatus.connected ? 'Connected' : 'Disconnected'}
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">local inference status</p>
        </div>
      </div>
    </header>
  )
}
