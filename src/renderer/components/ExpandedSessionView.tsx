import { useEffect, useRef } from 'react'
import type { SidecarStatus } from '../../shared/types'

interface ExpandedSessionViewProps {
  captureSourceLabel: string | null
  errorMessage: string | null
  isSubmitting: boolean
  onMinimize: () => void
  onSubmitPrompt: (text: string) => void
  onStop: () => void
  sidecarStatus: SidecarStatus
  streamedText: string
}

export default function ExpandedSessionView({
  captureSourceLabel,
  errorMessage,
  isSubmitting,
  onMinimize,
  onSubmitPrompt,
  onStop,
  sidecarStatus,
  streamedText,
}: ExpandedSessionViewProps) {
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom whenever new tokens arrive
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamedText])
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
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Assistant</p>
            <div className="mt-6 space-y-4">
              {/* Chat response box */}
              <div className="flex max-h-96 min-h-48 flex-col overflow-y-auto rounded-[1.5rem] border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Assistant</p>
                <div className="mt-4 flex-1 text-sm leading-7 text-slate-300 whitespace-pre-wrap">
                  {streamedText.length > 0 ? streamedText : (
                    <span className="text-slate-500">Response will appear here.</span>
                  )}
                  {/* Scroll anchor */}
                  <div ref={chatBottomRef} />
                </div>
                {/* Animated typing indicator */}
                {isSubmitting && (
                  <div className="mt-3 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" />
                  </div>
                )}
              </div>

              {/* Prompt form */}
              <form
                className="rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  const formData = new FormData(event.currentTarget)
                  const prompt = formData.get('prompt')

                  if (typeof prompt !== 'string') {
                    return
                  }

                  onSubmitPrompt(prompt)
                  event.currentTarget.reset()
                }}
              >
                <label className="block text-xs uppercase tracking-[0.24em] text-slate-500" htmlFor="session-prompt">
                  Prompt
                </label>
                <textarea
                  className="mt-3 h-28 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
                  id="session-prompt"
                  name="prompt"
                  placeholder="Summarize this slide"
                />
                <button
                  className="mt-4 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? 'Sending…' : 'Ask'}
                </button>
              </form>

              {/* Status strip */}
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
