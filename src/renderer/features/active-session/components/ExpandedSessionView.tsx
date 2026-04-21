import { useEffect, useState } from 'react'
import { Clock, Minimize2, Square } from 'lucide-react'
import type { ChatMessage } from '../../../../shared/types'
import delfinLogo from '../../../assets/logo.png'
import SessionConversation from '../../../components/SessionConversation'
import { useSessionStore } from '../../../stores/sessionStore'
import type { WaveformVisualState } from '../../../utils/waveformState'
import SessionPromptComposer from './SessionPromptComposer'

interface ExpandedSessionViewProps {
  errorMessage: string | null
  isAudioPlaying: boolean
  isSubmitting: boolean
  messages: ChatMessage[]
  sessionName: string
  onMinimize: () => void
  onStop: () => void
  onSubmitPrompt: (text: string) => void
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

function formatElapsedTime(startTime: number | null): string {
  if (startTime === null) return '0:00'

  const elapsed = Math.floor((Date.now() - startTime) / 1000)
  const hours = Math.floor(elapsed / 3600)
  const minutes = Math.floor((elapsed % 3600) / 60)
  const seconds = elapsed % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function SessionTimer({ startTime }: { startTime: number | null }) {
  const [elapsed, setElapsed] = useState(formatElapsedTime(startTime))

  useEffect(() => {
    setElapsed(formatElapsedTime(startTime))

    if (startTime === null) return

    const interval = setInterval(() => {
      setElapsed(formatElapsedTime(startTime))
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <Clock size={16} />
      <span className="font-medium tabular-nums">{elapsed}</span>
    </div>
  )
}

export default function ExpandedSessionView({
  errorMessage,
  isAudioPlaying,
  isSubmitting,
  messages,
  sessionName,
  onMinimize,
  onStop,
  onSubmitPrompt,
  onToggleVadListening,
  vadListeningEnabled,
  waveformState,
}: ExpandedSessionViewProps) {
  const sessionStartTime = useSessionStore((state) => state.sessionStartTime)
  const voiceMode = resolveVoiceMode({
    isSubmitting,
    isAudioPlaying,
    vadListeningEnabled,
    waveformState,
  })

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      <header className="relative border-b border-[var(--border-soft)] bg-[var(--bg-surface)] px-6 py-4">
        <div className="flex items-center justify-center gap-3">
          <img alt="Delfin logo" className="h-10 w-10 object-contain" src={delfinLogo} />
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--primary)]">
            Delfin
          </h1>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col border-r border-[var(--border-soft)]">
          <div className="min-h-0 flex-1 overflow-hidden">
            <SessionConversation
              className="h-full"
              emptyMessage="Ask about the current screen to start a conversation with Delfin."
              isAudioPlaying={isAudioPlaying}
              isSubmitting={isSubmitting}
              messages={messages}
            />
          </div>

          <div className="border-t border-[var(--border-soft)] bg-[var(--bg-surface)] p-4">
            <SessionPromptComposer
              className="flex items-center gap-2"
              disabled={isAudioPlaying}
              isSubmitting={isSubmitting}
              onSubmitPrompt={onSubmitPrompt}
              placeholder={isAudioPlaying ? 'Delfin is speaking…' : 'Ask Delfin'}
              submitLabel="Send"
            />
          </div>
        </main>

        <aside className="flex w-[20rem] shrink-0 flex-col gap-5 bg-[var(--bg-app-soft)] p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Session
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold leading-tight text-[var(--text-primary)]">
              {sessionName}
            </h2>
            <div className="mt-3 inline-flex items-center rounded-full bg-[var(--bg-surface)] px-3 py-1.5 shadow-sm">
              <SessionTimer startTime={sessionStartTime} />
            </div>
          </div>

          <VoiceCard
            onToggleVadListening={onToggleVadListening}
            vadListeningEnabled={vadListeningEnabled}
            voiceMode={voiceMode}
          />

          {errorMessage !== null ? (
            <section className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--danger)]">
                Error
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--danger)]">{errorMessage}</p>
            </section>
          ) : null}

          <div className="mt-auto flex flex-col gap-2.5">
            <button
              aria-label="Minimize to overlay"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              onClick={onMinimize}
              type="button"
            >
              <Minimize2 size={16} />
              Minimize
            </button>
            <button
              aria-label="End session"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--danger)]/80"
              onClick={onStop}
              type="button"
            >
              <Square size={14} fill="currentColor" />
              End Session
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

interface VoiceCardProps {
  onToggleVadListening: () => void
  vadListeningEnabled: boolean
  voiceMode: VoiceMode
}

function VoiceCard({ onToggleVadListening, vadListeningEnabled, voiceMode }: VoiceCardProps) {
  const statusLabel = (() => {
    switch (voiceMode) {
      case 'assistant':
        return 'Delfin is speaking'
      case 'thinking':
        return 'Delfin is thinking'
      case 'user':
        return 'Listening to you'
      case 'paused':
        return 'Speech is paused'
      case 'idle':
      default:
        return 'Ready to listen'
    }
  })()

  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <VoiceOrb mode={voiceMode} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            Voice
          </p>
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{statusLabel}</p>
        </div>
      </div>

      <button
        aria-label={vadListeningEnabled ? 'Mute microphone' : 'Unmute microphone'}
        aria-pressed={vadListeningEnabled}
        className={`mt-4 flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
          vadListeningEnabled
            ? 'border-[var(--primary)]/30 bg-[var(--primary-soft)] text-[var(--primary)] hover:bg-[var(--primary-soft)]/70'
            : 'border-[var(--border-soft)] bg-[var(--bg-surface-2)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
        }`}
        onClick={onToggleVadListening}
        type="button"
      >
        <span>{vadListeningEnabled ? 'Microphone on' : 'Microphone off'}</span>
        <ToggleSwitch on={vadListeningEnabled} />
      </button>
    </section>
  )
}

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
        on ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'
      }`}
      aria-hidden="true"
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </span>
  )
}

function VoiceOrb({ mode, size = 'md' }: { mode: VoiceMode; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-10 w-10' : 'h-6 w-6'
  const dotDim = size === 'lg' ? 'h-3 w-3' : 'h-2 w-2'

  const palette = (() => {
    switch (mode) {
      case 'user':
        return { core: 'bg-[var(--success)]', halo: 'bg-[var(--success)]/35', ring: 'bg-[var(--success)]' }
      case 'assistant':
        return { core: 'bg-[var(--accent)]', halo: 'bg-[var(--accent)]/35', ring: 'bg-[var(--accent)]' }
      case 'paused':
        return { core: 'bg-[var(--text-muted)]', halo: 'bg-transparent', ring: 'bg-[var(--text-muted)]' }
      case 'thinking':
      case 'idle':
      default:
        return { core: 'bg-[var(--primary)]', halo: 'bg-[var(--primary)]/20', ring: 'bg-[var(--primary)]' }
    }
  })()

  const isActive = mode === 'user' || mode === 'assistant'
  const isPulsing = mode === 'idle' || mode === 'thinking'

  return (
    <div className={`relative flex ${dim} shrink-0 items-center justify-center`} aria-label={`Voice ${mode}`}>
      {isActive ? (
        <>
          <span className={`absolute inset-0 animate-ping rounded-full ${palette.halo}`} />
          <span className={`absolute inset-[20%] rounded-full ${palette.ring} opacity-50`} />
        </>
      ) : null}
      <span
        className={`relative ${dotDim} rounded-full ${palette.core} ${isPulsing ? 'animate-pulse' : ''}`}
      />
    </div>
  )
}
