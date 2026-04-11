import type { ChatMessage, SidecarStatus } from '../../shared/types'
import ExpandedSessionHeader from './ExpandedSessionHeader'
import ExpandedSessionSidebar from './ExpandedSessionSidebar'
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(79,183,178,0.12),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(20,129,186,0.12),_transparent_22%),linear-gradient(180deg,_var(--bg-app)_0%,_var(--bg-app-soft)_100%)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 lg:px-8 lg:py-10">
        <ExpandedSessionHeader
          messages={messages}
          sidecarStatus={sidecarStatus}
        />

        <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_20rem]">
          <section className="flex min-h-0 flex-col rounded-[2rem] border border-[var(--border-soft)] bg-[var(--bg-overlay)] p-6 shadow-[0_24px_60px_var(--shadow-tint)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Conversation</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">The full active thread lives here while the overlay stays minimal.</p>
              </div>
              <div className="rounded-full border border-[var(--border-soft)] bg-[var(--primary-soft)] px-3 py-1 text-xs text-[var(--primary)]">
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
                className="rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-4 shadow-[0_14px_32px_rgba(20,129,186,0.08)]"
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
