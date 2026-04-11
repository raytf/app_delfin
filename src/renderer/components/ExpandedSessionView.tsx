import { useEffect, useState } from 'react'
import { Clock, Minimize2, Square } from 'lucide-react'
import type { ChatMessage, SidecarStatus } from '../../shared/types'
import delfinLogo from '../assets/logo.png'
import { useSessionStore } from '../stores/sessionStore'
import type { WaveformVisualState } from '../utils/waveformState'
import SessionConversation from './SessionConversation'
import SessionPromptComposer from './SessionPromptComposer'
import VoiceWaveform from './VoiceWaveform'

interface ExpandedSessionViewProps {
  captureSourceLabel: string | null
  errorMessage: string | null
  isAudioPlaying: boolean
  isSubmitting: boolean
  isMicListening: boolean
  isMicMuted: boolean
  messages: ChatMessage[]
  onMinimize: () => void
  onStop: () => void
  onSubmitPrompt: (text: string) => void
  onToggleVadListening: () => void
  showVoiceWaveform: boolean
  sidecarStatus: SidecarStatus
  vadListeningEnabled: boolean
  waveformLevel: number
  waveformState: WaveformVisualState
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
  captureSourceLabel,
  errorMessage,
  isAudioPlaying,
  isSubmitting,
  isMicListening,
  isMicMuted,
  messages,
  onMinimize,
  onStop,
  onSubmitPrompt,
  onToggleVadListening,
  showVoiceWaveform,
  sidecarStatus,
  vadListeningEnabled,
  waveformLevel,
  waveformState,
}: ExpandedSessionViewProps) {
  const sessionStartTime = useSessionStore((state) => state.sessionStartTime)
  const sessionName = captureSourceLabel ?? 'Study Session'

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-soft)] bg-[var(--bg-surface)] px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img alt="Delfin logo" className="h-14 w-14 object-contain" src={delfinLogo} />
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--primary)]">Delfin</h1>
              <p className="text-sm text-[var(--text-secondary)]">Your intelligent study companion.</p>
            </div>
          </div>

          <div className="rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface-2)] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {sidecarStatus.connected ? 'Sidecar Connected' : 'Sidecar Disconnected'}
          </div>
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
              className="flex items-center gap-3"
              isSubmitting={isSubmitting}
              onSubmitPrompt={onSubmitPrompt}
              placeholder="Ask about what's on screen"
              submitLabel="Ask"
            />
          </div>
        </main>

        <aside className="flex w-[22rem] shrink-0 flex-col gap-4 bg-[var(--bg-app-soft)] p-6">
          <div>
            <h2 className="font-display text-2xl font-semibold leading-tight text-[var(--text-primary)]">{sessionName}</h2>
            <div className="mt-4 inline-flex rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3">
              <SessionTimer startTime={sessionStartTime} />
            </div>
          </div>

          <section className="rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--text-muted)]">Speech</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              {isMicListening
                ? isMicMuted
                  ? 'Microphone is ready, but listening is currently paused.'
                  : 'Microphone is active and listening for your voice.'
                : 'Microphone is initialising.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[var(--bg-surface-2)] px-3 py-1 text-[var(--text-secondary)]">
                {vadListeningEnabled ? 'Speech On' : 'Speech Off'}
              </span>
              {isAudioPlaying ? (
                <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-[var(--primary)]">Speaking</span>
              ) : null}
            </div>
            {showVoiceWaveform ? (
              <div className="mt-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface-2)] px-3 py-2">
                <VoiceWaveform
                  label={`Speech waveform in ${waveformState} mode`}
                  level={waveformLevel}
                  state={waveformState}
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--text-muted)]">Current Capture</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              {captureSourceLabel ?? 'No frame captured yet. Your next prompt will capture the foreground window.'}
            </p>
          </section>

          {errorMessage !== null ? (
            <section className="rounded-[1.75rem] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--danger)]">Latest Error</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--danger)]">{errorMessage}</p>
            </section>
          ) : null}

          <div className="mt-auto flex flex-col gap-3">
            <button
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              onClick={onToggleVadListening}
              type="button"
            >
              {vadListeningEnabled ? 'Toggle Speech Off' : 'Toggle Speech On'}
            </button>
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