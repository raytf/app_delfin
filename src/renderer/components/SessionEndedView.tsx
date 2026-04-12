import { ArrowLeft, CheckCircle, Clock3, MessageSquare } from 'lucide-react'
import delfinLogo from '../assets/logo.png'

interface SessionEndedViewProps {
  duration: number
  messageCount: number
  onGoHome: () => void
  sessionName: string
}

function formatDuration(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60000)

  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return `${hours}h ${remainingMins}m`
}

export default function SessionEndedView({
  duration,
  messageCount,
  onGoHome,
  sessionName,
}: SessionEndedViewProps) {
  return (
    <div className="ocean-gradient flex min-h-screen flex-col items-center justify-center px-8 py-12 text-center">
      {/* Success icon */}
      <div className="relative mb-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--success-soft)]">
          <CheckCircle size={48} className="text-[var(--success)]" />
        </div>
        <img
          alt="Delfin"
          className="absolute -bottom-2 -right-2 h-12 w-12 rounded-full border-4 border-[var(--bg-app)] bg-white object-contain p-1"
          src={delfinLogo}
        />
      </div>

      {/* Title */}
      <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
        Session Complete
      </h1>

      {/* Session name */}
      <p className="mt-2 text-lg text-[var(--text-secondary)]">{sessionName}</p>

      {/* Stats */}
      <div className="mt-8 flex items-center gap-6">
        <div className="flex flex-col items-center rounded-2xl bg-[var(--bg-surface)] px-6 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <MessageSquare size={18} className="text-[var(--primary)]" />
            <span className="text-sm">Questions</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{messageCount}</p>
        </div>
        <div className="flex flex-col items-center rounded-2xl bg-[var(--bg-surface)] px-6 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Clock3 size={18} className="text-[var(--primary)]" />
            <span className="text-sm">Duration</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
            {formatDuration(duration)}
          </p>
        </div>
      </div>

      {/* Encouragement message */}
      <p className="mt-8 max-w-md text-[var(--text-muted)]">
        Great study session! Your progress has been saved. Keep up the momentum!
      </p>

      {/* Back to home button */}
      <button
        className="btn-ocean mt-8 flex cursor-pointer items-center gap-2 rounded-2xl px-6 py-3 text-base font-semibold text-white shadow-lg"
        onClick={onGoHome}
        type="button"
      >
        <ArrowLeft size={18} />
        Back to Home
      </button>
    </div>
  )
}
