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
  const compactStatusLabel = !isMicListening
    ? 'Starting'
    : isMicMuted
      ? 'Speech paused'
      : isSubmitting
        ? 'Thinking'
        : isAudioPlaying
          ? 'AI speaking'
          : 'Listening'

  return (
    <div className="drag-region flex h-screen overflow-hidden items-center justify-center text-[var(--text-primary)]">
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)]/95 shadow-xl ${isPromptOpen ? 'p-3' : 'px-3 py-3'}`}
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
        ) : (
          <>
            {showVoiceWaveform ? (
              <div className="no-drag rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface-2)]/80 px-3 py-2 shadow-sm">
                <VoiceWaveform
                  bars={waveformBars}
                  compact
                  label={`Compact speech waveform in ${waveformState} mode`}
                  state={waveformState}
                />
              </div>
            ) : null}

            <div className={`no-drag mt-2 flex w-full items-center justify-between gap-2 ${showVoiceWaveform ? '' : 'flex-1'}`}>
              <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${getCompactStatusClasses(waveformState)}`}>
                  {isSubmitting ? <Loader2 className="animate-spin" size={12} /> : isAudioPlaying ? <Volume2 size={12} /> : isMicMuted ? <MicOff size={12} /> : <Mic size={12} />}
                  <span className="truncate">{compactStatusLabel}</span>
                </span>
                {showVoiceWaveform ? (
                  <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {waveformState}
                  </span>
                ) : null}
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
          </>
        )}

        <div className={`mt-3 flex items-center gap-2 ${isPromptOpen ? 'justify-center' : 'w-full'}`}>
          <button
            aria-label={isPromptOpen ? 'Collapse' : 'Ask Delfin'}
            className={`no-drag flex cursor-pointer items-center justify-center gap-2 rounded-full font-medium transition ${isPromptOpen
              ? 'h-10 w-10 border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
              : 'min-w-0 flex-1 bg-[var(--primary)] px-4 py-2.5 text-sm text-white hover:bg-[var(--primary-hover)]'}`}
            onClick={() => onSetPromptOpen(!isPromptOpen)}
            type="button"
          >
            {isPromptOpen ? <ChevronDown size={18} /> : <MessageCircle size={16} />}
            {!isPromptOpen ? <span>Ask</span> : null}
          </button>

          {minimizedVariant !== 'prompt-response' ? (
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
      </div>
    </div>
  )
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
