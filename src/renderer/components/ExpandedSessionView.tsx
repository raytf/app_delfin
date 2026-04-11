import type { ChatMessage, SidecarStatus } from '../../shared/types'
import SessionConversation from './SessionConversation'
import SessionPromptComposer from './SessionPromptComposer'

interface ExpandedSessionViewProps {
  captureSourceLabel: string | null
  errorMessage: string | null
  isSubmitting: boolean
  messages: ChatMessage[]
  onMinimize: () => void
  onSubmitPrompt: (text: string) => void
  onStop: () => void
  sidecarStatus: SidecarStatus
}

export default function ExpandedSessionView({
  captureSourceLabel,
  errorMessage,
  isSubmitting,
  messages,
  onMinimize,
  onSubmitPrompt,
  onStop,
  sidecarStatus,
}: ExpandedSessionViewProps) {
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
          <div className="flex min-h-0 rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 shadow-2xl shadow-black/20">
            <div className="flex min-h-0 flex-1 flex-col">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Assistant</p>
            <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
              <SessionConversation
                className="min-h-[24rem] flex-1"
                emptyMessage="Ask about the current screen to start the session conversation."
                isSubmitting={isSubmitting}
                messages={messages}
              />

              <SessionPromptComposer
                className="rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-4"
                isSubmitting={isSubmitting}
                multiline
                onSubmitPrompt={onSubmitPrompt}
                placeholder="Summarize this slide"
                submitLabel="Ask"
              />

              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Status</p>
                  <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    {sidecarStatus.connected ? 'Sidecar connected' : 'Sidecar disconnected'}
                  </div>
                </div>
                <p className="mt-3 text-slate-400">
                  {captureSourceLabel === null ? 'No frame captured yet.' : `Latest capture: ${captureSourceLabel}`}
                </p>
                {errorMessage !== null ? <p className="mt-3 text-red-300">{errorMessage}</p> : null}
              </div>
            </div>
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
