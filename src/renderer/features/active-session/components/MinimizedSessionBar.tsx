import { ChevronDown, Maximize2, MessageCircle, Mic, MicOff, Square } from 'lucide-react'
import type { MinimizedOverlayVariant } from '../../../../shared/types'
import type { WaveformVisualState } from '../../../utils/waveformState'
import MinimizedPromptPanel from './MinimizedPromptPanel'
import ThinkingDots from '../../../components/ThinkingDots'

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

type VoiceMode = 'idle' | 'user' | 'thinking' | 'assistant' | 'paused'

function resolveVoiceMode(input: {
  isSubmitting: boolean
  isAudioPlaying: boolean
  vadListeningEnabled: boolean
  waveformState: WaveformVisualState
}): VoiceMode {
  if (input.isAudioPlaying || input.waveformState === 'assistant') return 'assistant'
  if (input.isSubmitting) return 'thinking'
  if (input.waveformState === 'user') return 'user'
  if (!input.vadListeningEnabled) return 'paused'
  return 'idle'
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
  const voiceMode = resolveVoiceMode({
    isSubmitting,
    isAudioPlaying,
    vadListeningEnabled,
    waveformState,
  })
  const hasResponseText = latestResponseText !== null && latestResponseText.length > 0
  const isThinkingOnly = isSubmitting && !hasResponseText && errorMessage === null

  if (isThinkingOnly) {
    return (
      <div className="drag-region flex h-screen items-center justify-center overflow-hidden">
        <div className="flex h-full w-full items-center justify-center rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-surface)]/95 shadow-xl backdrop-blur">
          <ThinkingDots />
        </div>
      </div>
    )
  }

  const statusLabel = getStatusLabel({
    isMicListening,
    isMicMuted,
    voiceMode,
  })

  return (
    <div className="drag-region flex h-screen items-center justify-center overflow-hidden text-[var(--text-primary)]">
      <div className={`flex h-full w-full flex-col overflow-hidden rounded-3xl backdrop-blur ${!isPromptOpen ? 'justify-center mt-2' : ''}`}>
        {isPromptOpen ? (
          <div className="no-drag flex min-h-0 flex-1 flex-col px-2.5 pb-4 pt-2.5">
            <MinimizedPromptPanel
              errorMessage={errorMessage}
              isAudioPlaying={isAudioPlaying}
              isSubmitting={isSubmitting}
              isShowingResponse={isResponseMode}
              latestResponseText={latestResponseText}
              onSubmitPrompt={onSubmitPrompt}
            />
          </div>
        ) : null}

        <CommandRow
          isPromptOpen={isPromptOpen}
          isResponseMode={isResponseMode}
          onAskAnother={onAskAnother}
          onOpen={onOpen}
          onSetPromptOpen={onSetPromptOpen}
          onStop={onStop}
          onToggleVadListening={onToggleVadListening}
          statusLabel={statusLabel}
          vadListeningEnabled={vadListeningEnabled}
          voiceMode={voiceMode}
        />
      </div>
    </div>
  )
}

interface CommandRowProps {
  isPromptOpen: boolean
  isResponseMode: boolean
  onAskAnother: () => void
  onOpen: () => void
  onSetPromptOpen: (isOpen: boolean) => void
  onStop: () => void
  onToggleVadListening: () => void
  statusLabel: string
  vadListeningEnabled: boolean
  voiceMode: VoiceMode
}

function CommandRow({
  isPromptOpen,
  isResponseMode,
  onAskAnother,
  onOpen,
  onSetPromptOpen,
  onStop,
  onToggleVadListening,
  statusLabel,
  vadListeningEnabled,
  voiceMode,
}: CommandRowProps) {
  return (
    <div className="flex w-full shrink-0 items-center justify-center gap-1.5 px-2.5 pb-2.5">
      <div className="flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface-2)]/70 px-3">
        <VoiceOrb mode={voiceMode} />
      </div>

      <button
        aria-label={vadListeningEnabled ? 'Pause speech listening' : 'Resume speech listening'}
        aria-pressed={vadListeningEnabled}
        className={`no-drag flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition ${
          vadListeningEnabled
            ? 'border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
            : 'border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
        }`}
        onClick={onToggleVadListening}
        type="button"
      >
        {vadListeningEnabled ? <Mic size={14} /> : <MicOff size={14} />}
      </button>

      {isResponseMode ? (
        <button
          aria-label="Ask another question"
          className="no-drag flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={onAskAnother}
          type="button"
        >
          Ask another
        </button>
      ) : !isPromptOpen ? (
        <button
          aria-label="Ask Delfin"
          className="no-drag flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--primary-hover)]"
          onClick={() => onSetPromptOpen(true)}
          type="button"
        >
          <MessageCircle size={13} />
          <span>Ask</span>
        </button>
      ) : null}

      {isPromptOpen && !isResponseMode ? (
        <button
          aria-label="Collapse"
          className="no-drag flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={() => onSetPromptOpen(false)}
          type="button"
        >
          <ChevronDown size={14} />
        </button>
      ) : null}

      <button
        aria-label="Expand session"
        className="no-drag flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        onClick={onOpen}
        type="button"
      >
        <Maximize2 size={14} />
      </button>

      <button
        aria-label="End session"
        className="no-drag flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--danger)] text-white transition hover:bg-[var(--danger)]/85"
        onClick={onStop}
        type="button"
      >
        <Square size={11} fill="currentColor" />
      </button>
    </div>
  )
}

function VoiceOrb({ mode }: { mode: VoiceMode }) {
  const palette = (() => {
    switch (mode) {
      case 'user':
        return { core: 'bg-[var(--success)]', halo: 'bg-[var(--success)]/35' }
      case 'assistant':
        return { core: 'bg-[var(--accent)]', halo: 'bg-[var(--accent)]/35' }
      case 'paused':
        return { core: 'bg-[var(--text-muted)]', halo: 'bg-transparent' }
      case 'thinking':
      case 'idle':
      default:
        return { core: 'bg-[var(--primary)]', halo: 'bg-[var(--primary)]/20' }
    }
  })()

  const isActive = mode === 'user' || mode === 'assistant'
  const isPulsing = mode === 'idle' || mode === 'thinking'

  return (
    <span className="relative flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden="true">
      {isActive ? <span className={`absolute inset-0 animate-ping rounded-full ${palette.halo}`} /> : null}
      <span className={`relative h-2 w-2 rounded-full ${palette.core} ${isPulsing ? 'animate-pulse' : ''}`} />
    </span>
  )
}

function getStatusLabel(input: {
  isMicListening: boolean
  isMicMuted: boolean
  voiceMode: VoiceMode
}): string {
  if (!input.isMicListening) return 'Starting'

  switch (input.voiceMode) {
    case 'assistant':
      return 'Speaking'
    case 'thinking':
      return 'Thinking'
    case 'user':
      return 'Listening'
    case 'paused':
      return 'Paused'
    case 'idle':
    default:
      return input.isMicMuted ? 'Standby' : 'Ready'
  }
}
