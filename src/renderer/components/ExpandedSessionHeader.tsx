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
    <header className="flex flex-col gap-6 rounded-[2rem] border border-slate-800/80 bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(8,47,73,0.84))] p-7 shadow-2xl shadow-black/20 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.34em] text-cyan-300">Active Session</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-white">
          Current conversation stays live here while the overlay handles quick prompts.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Use this expanded view for context, follow-up questions, and reviewing the full thread. The minimized overlay
          is now just a fast prompt surface.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Prompts</p>
          <p className="mt-2 text-3xl font-semibold text-white">{promptCount}</p>
          <p className="mt-1 text-sm text-slate-400">messages sent in this session</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Sidecar</p>
          <p className={`mt-2 text-sm font-semibold ${sidecarStatus.connected ? 'text-emerald-300' : 'text-amber-300'}`}>
            {sidecarStatus.connected ? 'Connected' : 'Disconnected'}
          </p>
          <p className="mt-1 text-sm text-slate-400">local inference status</p>
        </div>
      </div>
    </header>
  )
}
