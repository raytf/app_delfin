import type { MinimizedOverlayVariant } from '../../shared/types'
import MinimizedPromptPanel from './MinimizedPromptPanel'

interface MinimizedSessionBarProps {
  errorMessage: string | null
  isSubmitting: boolean
  latestResponseText: string | null
  minimizedVariant: MinimizedOverlayVariant
  onAskAnother: () => void
  onOpen: () => void
  onSetPromptOpen: (isOpen: boolean) => void
  onSubmitPrompt: (text: string) => void
  onStop: () => void
}

function PromptIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 4v16m8-8H4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 4H4v5m11-5h5v5M20 15v5h-5M4 15v5h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function EndIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export default function MinimizedSessionBar({
  errorMessage,
  isSubmitting,
  latestResponseText,
  minimizedVariant,
  onAskAnother,
  onOpen,
  onSetPromptOpen,
  onSubmitPrompt,
  onStop,
}: MinimizedSessionBarProps) {
  const isPromptOpen = minimizedVariant !== 'compact'

  return (
    <div className=" drag-region flex h-screen overflow-hidden items-center justify-center text-[var(--text-primary)]">
      <div
        className={`flex h-full w-full flex-col overflow-hidden border border-[var(--border-soft)] bg-[var(--bg-overlay)] shadow-[0_24px_60px_var(--shadow-tint)] backdrop-blur-xl ${
          isPromptOpen ? 'p-3' : 'items-center justify-center px-3 py-2'
        }`}
      >
        {isPromptOpen ? (
          <MinimizedPromptPanel
            errorMessage={errorMessage}
            isSubmitting={isSubmitting}
            isShowingResponse={minimizedVariant === 'prompt-response'}
            latestResponseText={latestResponseText}
            onAskAnother={onAskAnother}
            onExpand={onOpen}
            onSubmitPrompt={onSubmitPrompt}
          />
        ) : null}

        <div className={isPromptOpen ? 'drag-region mt-3 flex items-center justify-center gap-2' : 'drag-region flex items-center justify-center gap-2'}>
          <button
            aria-label="Start prompt"
            className="no-drag flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            onClick={() => {
              onSetPromptOpen(!isPromptOpen)
            }}
            type="button"
          >
            <PromptIcon />
          </button>
          <button
            aria-label="Expand session"
            className="no-drag flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            onClick={onOpen}
            type="button"
          >
            <ExpandIcon />
          </button>
          <button
            aria-label="End session"
            className="no-drag flex h-11 w-11 items-center justify-center rounded-full bg-[var(--danger)] text-white transition hover:bg-[#b14d4d]"
            onClick={onStop}
            type="button"
          >
            <EndIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
