import { useEffect, useState } from 'react'
import type { SessionListItem } from '../../shared/types'
import delfinLogo from '../assets/logo.png'
import SessionHistoryCard from './SessionHistoryCard'

interface HomeScreenProps {
  onDeleteSession: (sessionId: string) => void
  onStartSession: (sessionName: string) => void
  onSelectSession: (sessionId: string) => void
  onViewAllSessions: () => void
  sessions: SessionListItem[]
  userName: string | null
}

// Typing effect component
function TypewriterText({
  text,
  className,
  delay = 0,
  onComplete,
}: {
  text: string
  className?: string
  delay?: number
  onComplete?: () => void
}) {
  const [displayedText, setDisplayedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [started, setStarted] = useState(delay === 0)

  useEffect(() => {
    if (delay > 0) {
      const timeout = setTimeout(() => setStarted(true), delay)
      return () => clearTimeout(timeout)
    }
  }, [delay])

  useEffect(() => {
    if (!started) return

    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex])
        setCurrentIndex((prev) => prev + 1)
      }, 40)
      return () => clearTimeout(timeout)
    } else if (currentIndex === text.length && onComplete) {
      onComplete()
    }
  }, [currentIndex, text, started, onComplete])

  if (!started) return null

  return (
    <span className={className}>
      {displayedText}
      {currentIndex < text.length && (
        <span className="animate-pulse text-[var(--primary)]">|</span>
      )}
    </span>
  )
}

// Dolphin wave SVG for decorative element
function WaveDecoration() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden opacity-60">
      <svg
        className="absolute -top-1/2 left-1/2 w-[200%] -translate-x-1/2"
        viewBox="0 0 1200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path
          d="M0 100 Q150 50 300 100 T600 100 T900 100 T1200 100 V0 H0 Z"
          fill="url(#wave-gradient)"
        />
        <defs>
          <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--ocean-bright)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--ocean-bright)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

interface StartSessionModalProps {
  isOpen: boolean
  onClose: () => void
  onStart: (sessionName: string) => void
}

function StartSessionModal({ isOpen, onClose, onStart }: StartSessionModalProps) {
  const [sessionName, setSessionName] = useState('')

  if (!isOpen) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onStart(sessionName.trim() || 'Study Session')
    setSessionName('')
  }

  function handleClose() {
    setSessionName('')
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[var(--bg-surface)] p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center font-display text-xl font-semibold text-[var(--text-primary)]">
          Name your session
        </h2>
        <p className="mt-2 text-center text-sm text-[var(--text-muted)]">
          Give it a name so you can find it later
        </p>

        <form onSubmit={handleSubmit} className="mt-5">
          <input
            autoFocus
            className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
            onChange={(e) => setSessionName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you studying today?"
            type="text"
            value={sessionName}
          />

          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              className="cursor-pointer rounded-xl px-4 py-2.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
              onClick={handleClose}
              type="button"
            >
              Maybe later
            </button>
            <button
              className="cursor-pointer rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
              type="submit"
            >
              Lock In
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function HomeScreen({
  onDeleteSession,
  onStartSession,
  onSelectSession,
  onViewAllSessions,
  sessions,
  userName,
}: HomeScreenProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const recentSessions = sessions.slice(0, 6)

  function handleStartSession(sessionName: string) {
    setIsModalOpen(false)
    onStartSession(sessionName)
  }

  return (
    <div className="ocean-gradient relative min-h-screen text-[var(--text-primary)]">
      <WaveDecoration />

      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col px-8 py-12">
        {/* Hero Section - Centered */}
        <main className="flex flex-1 flex-col items-center justify-center pb-8 pt-4 text-center">
          <div className="flex items-center gap-2">
            <img
              alt="Delfin logo"
              className="h-16 w-16 object-contain sm:h-20 sm:w-20"
              src={delfinLogo}
            />
            <h1 className="font-display text-5xl font-bold tracking-tight text-[var(--primary)] sm:text-6xl">
              Delfin
            </h1>
          </div>

          {/* Tagline with typing effect */}
          <div className="mt-3 max-w-xl text-xl leading-relaxed">
            <p className="text-[var(--text-secondary)]">
              <TypewriterText text="Your intelligent study companion that sees what you see." />
            </p>
            <p className="mt-0 text-[var(--text-muted)]">
              <TypewriterText
                text="Ask questions, get explanations, and learn faster together."
                delay={2400}
              />
            </p>
          </div>

          {/* Welcome message */}
          {userName !== null && (
            <p className="mt-6 text-2xl text-[var(--text-secondary)]">
              Welcome back, <span className="font-semibold text-[var(--primary)]">{userName}</span>
            </p>
          )}

          {/* Start Session Button */}
          <button
            className="btn-ocean mt-8 cursor-pointer rounded-2xl px-8 py-4 text-base font-semibold text-white shadow-lg"
            onClick={() => setIsModalOpen(true)}
            type="button"
          >
            Start Studying
          </button>
        </main>

        {/* Recent Sessions Section */}
        <section className="pb-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Recent Sessions
            </h2>
            {sessions.length > 0 && (
              <button
                className="cursor-pointer text-sm font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
                onClick={onViewAllSessions}
                type="button"
              >
                View All Sessions
              </button>
            )}
          </div>

          {recentSessions.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentSessions.map((session) => (
                <SessionHistoryCard
                  key={session.id}
                  onDelete={() => {
                    onDeleteSession(session.id)
                  }}
                  onClick={() => {
                    onSelectSession(session.id)
                  }}
                  session={session}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--bg-surface)]/50 p-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]">
                <svg
                  className="h-7 w-7 text-[var(--primary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
              </div>
              <p className="font-display text-base font-medium text-[var(--text-secondary)]">
                Ready to dive in?
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Your study sessions will appear here
              </p>
            </div>
          )}
        </section>
      </div>

      <StartSessionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStart={handleStartSession}
      />
    </div>
  )
}
