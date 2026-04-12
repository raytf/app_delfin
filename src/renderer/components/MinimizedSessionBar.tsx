import { ChevronDown, Maximize2, MessageCircle, Mic, MicOff, Square } from 'lucide-react'
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

type VoiceMode = 'idle' | 'user' | 'thinking' | 'assistant' | 'paused'

function resolveVoiceMode(input: {
  isSubmitting: boolean
  isAudioPlaying: boolean
  vadListeningEnabled: boolean
  waveformState: WaveformVisualState
}): VoiceMode {
  if (input.isAudioPlaying || input.waveformState === 'assistant') {
    return 'assistant'
  }
  if (input.isSubmitting) {
    return 'thinking'
  }
  if (input.waveformState === 'user') {
    return 'user'
  }
  if (!input.vadListeningEnabled) {
    return 'paused'
  }
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
  const statusLabel = getStatusLabel({
    isMicListening,
    isMicMuted,
    voiceMode,
  })

  return (
    <div className="drag-region flex h-screen items-center justify-center overflow-hidden text-[var(--text-primary)]">
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--bg-surface)]/95 shadow-xl backdrop-blur ${isPromptOpen ? 'p-2.5' : 'px-2.5 py-2.5'}`}
      >
        <VoiceStatusHeader
          onToggleVadListening={onToggleVadListening}
          statusLabel={statusLabel}
          vadListeningEnabled={vadListeningEnabled}
          voiceMode={voiceMode}
        />

        {isPromptOpen ? (
          <div className="mt-2.5 min-h-0 flex-1">
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
  onToggleVadListening: () => void
  statusLabel: string
  vadListeningEnabled: boolean
  voiceMode: VoiceMode
}

function VoiceStatusHeader({
  onToggleVadListening,
  statusLabel,
  vadListeningEnabled,
  voiceMode,
}: VoiceStatusHeaderProps) {
  return (
    <div className="no-drag flex items-center justify-between gap-2 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface-2)]/70 px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <VoiceOrb mode={voiceMode} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          {statusLabel}
        </span>
      </div>

      <button
        aria-label={vadListeningEnabled ? 'Pause speech listening' : 'Resume speech listening'}
        className="no-drag flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        onClick={onToggleVadListening}
        type="button"
      >
        {vadListeningEnabled ? <Mic size={14} /> : <MicOff size={14} />}
      </button>
    </div>
  )
}

function VoiceOrb({ mode }: { mode: VoiceMode }) {
  if (mode === 'thinking') {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center" aria-label="Delfin thinking">
        <span className="flex items-end gap-[3px]">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--warning)] [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--warning)] [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--warning)]" />
        </span>
      </div>
    )
  }

  const palette = (() => {
    switch (mode) {
      case 'user':
        return { ring: 'bg-[var(--success)]', core: 'bg-[var(--success)]', halo: 'bg-[var(--success)]/35' }
      case 'assistant':
        return { ring: 'bg-[var(--accent)]', core: 'bg-[var(--accent)]', halo: 'bg-[var(--accent)]/35' }
      case 'paused':
        return { ring: 'bg-[var(--text-muted)]', core: 'bg-[var(--text-muted)]', halo: 'bg-transparent' }
      case 'idle':
      default:
        return { ring: 'bg-[var(--primary)]', core: 'bg-[var(--primary)]', halo: 'bg-[var(--primary)]/20' }
    }
  })()

  const isActive = mode === 'user' || mode === 'assistant'

  return (
    <div className="relative flex h-5 w-5 shrink-0 items-center justify-center" aria-label={`Voice ${mode}`}>
      {isActive ? (
        <>
          <span className={`absolute inset-0 animate-ping rounded-full ${palette.halo}`} />
          <span className={`absolute inset-[3px] rounded-full ${palette.ring} opacity-50`} />
        </>
      ) : null}
      <span
        className={`relative h-2 w-2 rounded-full ${palette.core} ${mode === 'idle' ? 'animate-pulse' : ''}`}
      />
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
    <div className="mt-2.5 flex w-full items-center gap-2">
      {isResponseMode ? (
        <button
          aria-label="Ask another question"
          className="no-drag min-w-0 flex-1 cursor-pointer rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={onAskAnother}
          type="button"
        >
          Ask another
        </button>
      ) : !isPromptOpen ? (
        <button
          aria-label="Ask Delfin"
          className="no-drag flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--primary-hover)]"
          onClick={() => onSetPromptOpen(true)}
          type="button"
        >
          <MessageCircle size={14} />
          <span>Ask</span>
        </button>
      ) : null}

      {isPromptOpen ? (
        <button
          aria-label="Collapse"
          className="no-drag flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={() => onSetPromptOpen(false)}
          type="button"
        >
          <ChevronDown size={16} />
        </button>
      ) : null}

      {minimizedVariant !== 'prompt-response' || isPromptOpen ? (
        <button
          aria-label="Expand session"
          className="no-drag flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={onOpen}
          type="button"
        >
          <Maximize2 size={16} />
        </button>
      ) : null}

      <button
        aria-label="End session"
        className="no-drag flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--danger)] text-white transition hover:bg-[var(--danger)]/80"
        onClick={onStop}
        type="button"
      >
        <Square size={12} fill="currentColor" />
      </button>
    </div>
  )
}

function getStatusLabel(input: {
  isMicListening: boolean
  isMicMuted: boolean
  voiceMode: VoiceMode
}): string {
  if (!input.isMicListening) {
    return 'Starting'
  }

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
