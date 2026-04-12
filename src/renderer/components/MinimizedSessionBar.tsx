import { ChevronDown, Loader2, Maximize2, MessageCircle, Mic, MicOff, Square, Volume2 } from 'lucide-react'
import type { MinimizedOverlayVariant } from '../../shared/types'
import type { WaveformBars, WaveformVisualState } from '../utils/waveformState'
import MinimizedPromptPanel from './MinimizedPromptPanel'
import VoiceWaveform from './VoiceWaveform'

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
  showVoiceWaveform: boolean
  vadListeningEnabled: boolean
  waveformBars: WaveformBars
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
  showVoiceWaveform,
  vadListeningEnabled,
  waveformBars,
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
        className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)]/95 shadow-xl ${isPromptOpen ? 'p-3' : 'px-3 py-3'}`}
      >
        {isPromptOpen ? (
          <>
            <VoiceStatusHeader
              compact={false}
              showVoiceWaveform={showVoiceWaveform}
              statusLabel={statusLabel}
              vadListeningEnabled={vadListeningEnabled}
              waveformBars={waveformBars}
              waveformState={waveformState}
              onToggleVadListening={onToggleVadListening}
            />

            <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
              <MinimizedPromptPanel
                errorMessage={errorMessage}
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
              showVoiceWaveform={showVoiceWaveform}
              statusLabel={statusLabel}
              vadListeningEnabled={vadListeningEnabled}
              waveformBars={waveformBars}
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
  onToggleVadListening: () => void
  showVoiceWaveform: boolean
  statusLabel: string
  vadListeningEnabled: boolean
  waveformBars: WaveformBars
  waveformState: WaveformVisualState
}

function VoiceStatusHeader({
  compact = false,
  onToggleVadListening,
  showVoiceWaveform,
  statusLabel,
  vadListeningEnabled,
  waveformBars,
  waveformState,
}: VoiceStatusHeaderProps) {
  return (
    <div className={`no-drag shrink-0 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface-2)]/80 shadow-sm ${compact ? 'px-3 py-2' : 'px-3 py-2.5'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--text-muted)]">
          <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${getCompactStatusClasses(waveformState)}`}>
            {waveformState === 'processing' ? <Loader2 className="animate-spin" size={12} /> : waveformState === 'assistant' ? <Volume2 size={12} /> : vadListeningEnabled ? <Mic size={12} /> : <MicOff size={12} />}
            <span className="truncate">{statusLabel}</span>
          </span>
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

      {showVoiceWaveform ? (
        <div className={compact ? 'mt-2' : 'mt-2.5'}>
          <VoiceWaveform
            bars={waveformBars}
            compact={compact}
            label={`${compact ? 'Compact' : 'Expanded'} speech waveform in ${waveformState} mode`}
            state={waveformState}
          />
        </div>
      ) : null}
    </div>
  )
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
    <div className="mt-3 flex w-full shrink-0 items-center gap-2">
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
    return 'AI speaking'
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
