import { MessageCircle, Maximize2, Square, ChevronDown } from 'lucide-react'
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
    <div className="drag-region flex h-screen overflow-hidden items-center justify-center text-[var(--text-primary)]">
      <div
        className={`flex h-full w-full flex-col overflow-hidden ${
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

        {/* Action Bar */}
        <div
          className={`drag-region flex items-center gap-1.5 ${
            isPromptOpen ? 'mt-3 justify-center' : 'p-1.5'
          }`}
        >
          {/* Ask Delfin - Primary Action / Collapse */}
          <button
            aria-label={isPromptOpen ? "Collapse" : "Ask Delfin"}
            className={`no-drag flex cursor-pointer items-center gap-2 rounded-full font-medium transition ${
              isPromptOpen
                ? 'h-10 w-10 justify-center border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                : 'bg-[var(--primary)] px-4 py-2.5 text-sm text-white hover:bg-[var(--primary-hover)]'
            }`}
            onClick={() => onSetPromptOpen(!isPromptOpen)}
            type="button"
          >
            {isPromptOpen ? <ChevronDown size={18} /> : <MessageCircle size={18} />}
            {!isPromptOpen && <span>Ask Delfin</span>}
          </button>

          {/* Expand - Secondary Action (hidden when showing response, as there's a dedicated expand button) */}
          {minimizedVariant !== 'prompt-response' && (
            <button
              aria-label="Expand session"
              className="no-drag flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
              onClick={onOpen}
              type="button"
            >
              <Maximize2 size={18} />
            </button>
          )}

          {/* End Session */}
          <button
            aria-label="End session"
            className="no-drag flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[var(--danger)] text-white transition hover:bg-[var(--danger)]/80"
            onClick={onStop}
            type="button"
          >
            <Square size={14} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  )
}
