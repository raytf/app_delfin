import type { ChatMessage, SidecarStatus } from '../../shared/types'
import ExpandedSessionHeader from './ExpandedSessionHeader'
import ExpandedSessionSidebar from './ExpandedSessionSidebar'
import SessionConversation from './SessionConversation'
import SessionPromptComposer from './SessionPromptComposer'

interface ExpandedSessionViewProps {
  captureSourceLabel: string | null
  errorMessage: string | null
  isSubmitting: boolean
  /** True once MicVAD is running and listening (VAD initialised). */
  isMicListening: boolean
  /** True if the user manually muted the mic. */
  isMicMuted: boolean
  messages: ChatMessage[]
  onMinimize: () => void
  onSubmitPrompt: (text: string) => void
  onStop: () => void
  /** Toggle mic mute state. */
  onToggleMute: () => void
  sidecarStatus: SidecarStatus
}

export default function ExpandedSessionView({
  captureSourceLabel,
  errorMessage,
  isSubmitting,
  isMicListening,
  isMicMuted,
  messages,
  onMinimize,
  onSubmitPrompt,
  onStop,
  onToggleMute,
  sidecarStatus,
}: ExpandedSessionViewProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.12),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_22%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 lg:px-8 lg:py-10">
        <ExpandedSessionHeader
          messages={messages}
          sidecarStatus={sidecarStatus}
        />

        {/* ── [TEST] VAD mic status indicator ── */}
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-300">
          <span className="font-semibold uppercase tracking-widest text-yellow-500">[TEST]</span>
          {isMicListening ? (
            isMicMuted ? (
              <span>🔇 Mic muted</span>
            ) : (
              <span>🎙️ Mic active — listening for speech</span>
            )
          ) : (
            <span>⏳ Mic initialising…</span>
          )}
          <button
            className="no-drag ml-auto rounded border border-yellow-500/50 px-2 py-0.5 text-yellow-300 hover:bg-yellow-500/20"
            onClick={onToggleMute}
            type="button"
          >
            {isMicMuted ? 'Unmute' : 'Mute'}
          </button>
        </div>

        <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_20rem]">
          <section className="flex min-h-0 flex-col rounded-[2rem] border border-slate-800 bg-slate-950/72 p-6 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Conversation</p>
                <p className="mt-2 text-sm text-slate-400">The full active thread lives here while the overlay stays minimal.</p>
              </div>
              <div className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                {messages.length} messages
              </div>
            </div>

            <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
              <SessionConversation
                className="min-h-[28rem] flex-1"
                emptyMessage="Ask about the current screen to start the session conversation."
                isSubmitting={isSubmitting}
                messages={messages}
              />

              <SessionPromptComposer
                className="rounded-[1.5rem] border border-slate-800 bg-slate-900/80 p-4"
                isSubmitting={isSubmitting}
                multiline
                onSubmitPrompt={onSubmitPrompt}
                placeholder="Summarize this slide"
                submitLabel="Ask"
              />
            </div>
          </section>

          <ExpandedSessionSidebar
            captureSourceLabel={captureSourceLabel}
            errorMessage={errorMessage}
            onMinimize={onMinimize}
            onStop={onStop}
          />
        </div>
      </div>
    </div>
  )
}
