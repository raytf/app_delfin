import { ChevronDown, Maximize2, MessageCircle, Mic, MicOff, Square, Volume2 } from 'lucide-react'
import type { MinimizedOverlayVariant } from '../../shared/types'
import type { WaveformVisualState } from '../utils/waveformState'
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
  waveformState: WaveformVisualState
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
  waveformState,
}: MinimizedSessionBarProps) {
  const isPromptOpen = minimizedVariant !== 'compact'
  const isResponseMode = minimizedVariant === 'prompt-response'
  const statusLabel = getMinimizedStatusLabel({
    isAudioPlaying,
    isMicListening,
    isMicMuted,
    isPromptOpen,
    isResponseMode,
    isSubmitting,
  })

  return (
    <div className="drag-region flex h-screen overflow-hidden items-center justify-center text-[var(--text-primary)]">
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)]/95 shadow-xl ${isPromptOpen ? 'p-3' : 'px-3 py-3'}`}
      >
        {isPromptOpen ? (
          <>
            <VoiceStatusHeader
              compact={false}
              isSubmitting={isSubmitting}
              statusLabel={statusLabel}
              vadListeningEnabled={vadListeningEnabled}
              waveformState={waveformState}
              onToggleVadListening={onToggleVadListening}
            />

            <div className="mt-3 min-h-0 flex-1">
              <MinimizedPromptPanel
                errorMessage={errorMessage}
                isAudioPlaying={isAudioPlaying}
                isSubmitting={isSubmitting}
                isShowingResponse={isResponseMode}
                latestResponseText={latestResponseText}
                onSubmitPrompt={onSubmitPrompt}
              />
            </div>
          </>
        ) : (
          <>
            <VoiceStatusHeader
              compact
              isSubmitting={isSubmitting}
              statusLabel={statusLabel}
              vadListeningEnabled={vadListeningEnabled}
              waveformState={waveformState}
              onToggleVadListening={onToggleVadListening}
            />
          </>
        )}

        <ActionRow
          isPromptOpen={isPromptOpen}
          isResponseMode={isResponseMode}
          minimizedVariant={minimizedVariant}
          onAskAnother={onAskAnother}
          onOpen={onOpen}
          onSetPromptOpen={onSetPromptOpen}
          onStop={onStop}
        />
      </div>
    </div>
  )
}

interface VoiceStatusHeaderProps {
  compact?: boolean
  isSubmitting: boolean
  onToggleVadListening: () => void
  statusLabel: string
  vadListeningEnabled: boolean
  waveformState: WaveformVisualState
}

function VoiceStatusHeader({
  compact = false,
  isSubmitting,
  onToggleVadListening,
  statusLabel,
  vadListeningEnabled,
  waveformState,
}: VoiceStatusHeaderProps) {
  return (
    <div className={`no-drag rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface-2)]/80 shadow-sm ${compact ? 'px-3 py-2' : 'px-3 py-2.5'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--text-muted)]">
          <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${getCompactStatusClasses(waveformState)}`}>
            {waveformState === 'assistant' ? <Volume2 size={12} /> : vadListeningEnabled ? <Mic size={12} /> : <MicOff size={12} />}
            <span className="truncate">{statusLabel}</span>
          </span>

          <VoiceBubble state={waveformState} isSubmitting={isSubmitting} />

          <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {compact ? 'voice' : 'live voice'}
          </span>
        </div>

        <button
          aria-label={vadListeningEnabled ? 'Pause speech listening' : 'Resume speech listening'}
          className="no-drag flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={onToggleVadListening}
          type="button"
        >
          {vadListeningEnabled ? <Mic size={16} /> : <MicOff size={16} />}
        </button>
      </div>
    </div>
  )
}

interface VoiceBubbleProps {
  isSubmitting: boolean
  state: WaveformVisualState
}

function VoiceBubble({ isSubmitting, state }: VoiceBubbleProps) {
  // Thinking: three bouncing dots, no voice indicator
  if (isSubmitting && state !== 'user' && state !== 'assistant') {
    return (
      <div className="flex items-center gap-[3px]" aria-label="Thinking">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)] animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)] animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)] animate-bounce [animation-delay:300ms]" />
      </div>
    )
  }

  // User speaking: green pulsing bubble
  if (state === 'user') {
    return (
      <div className="relative flex h-4 w-4 shrink-0 items-center justify-center" aria-label="Voice detected">
        <span className="absolute h-4 w-4 animate-ping rounded-full bg-[var(--success)] opacity-40" />
        <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
      </div>
    )
  }

  // Delfin speaking: blue pulsing bubble
  if (state === 'assistant') {
    return (
      <div className="relative flex h-4 w-4 shrink-0 items-center justify-center" aria-label="Delfin speaking">
        <span className="absolute h-4 w-4 animate-ping rounded-full bg-[var(--primary)] opacity-40" />
        <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
      </div>
    )
  }

  // Idle: no indicator
  return null
}

interface ActionRowProps {
  isPromptOpen: boolean
  isResponseMode: boolean
  minimizedVariant: MinimizedOverlayVariant
  onAskAnother: () => void
  onOpen: () => void
  onSetPromptOpen: (isOpen: boolean) => void
  onStop: () => void
}

function ActionRow({
  isPromptOpen,
  isResponseMode,
  minimizedVariant,
  onAskAnother,
  onOpen,
  onSetPromptOpen,
  onStop,
}: ActionRowProps) {
  return (
    <div className="mt-3 flex w-full items-center gap-2">
      {isResponseMode ? (
        <button
          aria-label="Ask another question"
          className="no-drag min-w-0 flex-1 cursor-pointer rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={onAskAnother}
          type="button"
        >
          Ask another
        </button>
      ) : !isPromptOpen ? (
        <button
          aria-label="Ask Delfin"
          className="no-drag flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--primary-hover)]"
          onClick={() => onSetPromptOpen(true)}
          type="button"
        >
          <MessageCircle size={16} />
          <span>Ask</span>
        </button>
      ) : null}

      {isPromptOpen ? (
        <button
          aria-label="Collapse"
          className="no-drag flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={() => onSetPromptOpen(false)}
          type="button"
        >
          <ChevronDown size={18} />
        </button>
      ) : null}

      {minimizedVariant !== 'prompt-response' || isPromptOpen ? (
        <button
          aria-label="Expand session"
          className="no-drag flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={onOpen}
          type="button"
        >
          <Maximize2 size={18} />
        </button>
      ) : null}

      <button
        aria-label="End session"
        className="no-drag flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[var(--danger)] text-white transition hover:bg-[var(--danger)]/80"
        onClick={onStop}
        type="button"
      >
        <Square size={14} fill="currentColor" />
      </button>
    </div>
  )
}

function getMinimizedStatusLabel(input: {
  isAudioPlaying: boolean
  isMicListening: boolean
  isMicMuted: boolean
  isPromptOpen: boolean
  isResponseMode: boolean
  isSubmitting: boolean
}): string {
  if (!input.isMicListening) {
    return 'Starting'
  }

  if (input.isMicMuted) {
    return 'Speech paused'
  }

  if (input.isSubmitting) {
    return 'Thinking'
  }

  if (input.isAudioPlaying) {
    return 'Speaking'
  }

  if (input.isPromptOpen && input.isResponseMode) {
    return 'Ready'
  }

  return 'Listening'
}

function getCompactStatusClasses(state: WaveformVisualState): string {
  switch (state) {
    case 'user':
      return 'bg-[var(--success-soft)] text-[var(--success)]'
    case 'assistant':
      return 'bg-[var(--primary-soft)] text-[var(--primary)]'
    case 'processing':
      return 'bg-[var(--warning-soft)] text-[var(--warning)]'
    case 'idle':
      return 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)]'
  }
}
