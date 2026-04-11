import { MessageCircle, Maximize2, Square, ChevronDown } from 'lucide-react'
import type { MinimizedOverlayVariant } from '../../shared/types'
import MinimizedPromptPanel from './MinimizedPromptPanel'

interface MinimizedSessionBarProps {
  errorMessage: string | null
  isAudioPlaying: boolean
  isSubmitting: boolean
  isMicListening: boolean
  isMicMuted: boolean
  latestResponseText: string | null
  minimizedVariant: MinimizedOverlayVariant
  onAskAnother: () => void
  onOpen: () => void
  onSetPromptOpen: (isOpen: boolean) => void
  onSubmitPrompt: (text: string) => void
  onStop: () => void
  onToggleVadListening: () => void
  vadListeningEnabled: boolean
}

export default function MinimizedSessionBar({
  errorMessage,
  isAudioPlaying,
  isSubmitting,
  isMicListening,
  isMicMuted,
  latestResponseText,
  minimizedVariant,
  onAskAnother,
  onOpen,
  onSetPromptOpen,
  onSubmitPrompt,
  onStop,
  onToggleVadListening,
  vadListeningEnabled,
}: MinimizedSessionBarProps) {
  const isPromptOpen = minimizedVariant !== 'compact'

  return (
    <div className="drag-region flex h-screen overflow-hidden items-center justify-center text-[var(--text-primary)]">
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)]/95 shadow-xl ${isPromptOpen ? 'p-3' : 'items-center justify-center px-3 py-2'
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

        <div className={`no-drag flex items-center justify-center gap-2 text-[10px] ${isPromptOpen ? 'mt-2 text-[var(--text-muted)]' : 'mb-1 text-[var(--text-muted)]'}`}>
          <span>{isMicListening ? (isMicMuted ? '🔇' : '🎙️') : '⏳'}</span>
          <button
            className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            onClick={onToggleVadListening}
            type="button"
          >
            {vadListeningEnabled ? 'Toggle Speech Off' : 'Toggle Speech On'}
          </button>
          {isAudioPlaying ? <span className="animate-pulse text-[var(--primary)]">🔊 speaking</span> : null}
        </div>

        <div
          className={`drag-region flex items-center gap-1.5 ${isPromptOpen ? 'mt-3 justify-center' : 'p-1.5'
            }`}
        >
          <button
            aria-label={isPromptOpen ? "Collapse" : "Ask Delfin"}
            className={`no-drag flex cursor-pointer items-center gap-2 rounded-full font-medium transition ${isPromptOpen
                ? 'h-10 w-10 justify-center border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                : 'bg-[var(--primary)] px-4 py-2.5 text-sm text-white hover:bg-[var(--primary-hover)]'
              }`}
            onClick={() => onSetPromptOpen(!isPromptOpen)}
            type="button"
          >
            {isPromptOpen ? <ChevronDown size={18} /> : <MessageCircle size={18} />}
            {!isPromptOpen && <span>Ask Delfin</span>}
          </button>

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
