import { useCallback } from 'react'
import { ArrowLeft, CheckCircle, Clock3, MessageSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import delfinLogo from '../../assets/logo.png'
import { OverlayLoadScreen, useOverlayRouteSync } from '../shared/hooks/useOverlayRouting'
import { ROUTES } from '../../navigation/routes'
import { useOverlayStore } from '../../stores/overlayStore'

function formatDuration(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60000)

  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return `${hours}h ${remainingMins}m`
}

export default function SessionEndedScreen() {
  const navigate = useNavigate()
  const { overlayState } = useOverlayRouteSync()
  const pendingEndedSession = useOverlayStore((state) => state.pendingEndedSession)
  const resetToHome = useOverlayStore((state) => state.resetToHome)

  const handleGoHomeFromEnded = useCallback(async (): Promise<void> => {
    resetToHome()
    navigate(ROUTES.home, { replace: true })
    await window.api.clearEndedSession()
  }, [navigate, resetToHome])

  if (overlayState === null) {
    return <OverlayLoadScreen message="Loading session summary..." />
  }

  const snapshot = overlayState.endedSessionData ?? pendingEndedSession
  if (snapshot === null) {
    return <OverlayLoadScreen message="Loading session summary..." />
  }

  return (
    <div className="ocean-gradient flex min-h-screen flex-col items-center justify-center px-8 py-12 text-center">
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

      <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
        Session Complete
      </h1>

      <p className="mt-2 text-lg text-[var(--text-secondary)]">{snapshot.sessionName}</p>

      <div className="mt-8 flex items-center gap-6">
        <div className="flex flex-col items-center rounded-2xl bg-[var(--bg-surface)] px-6 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <MessageSquare size={18} className="text-[var(--primary)]" />
            <span className="text-sm">Questions</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
            {snapshot.messageCount}
          </p>
        </div>
        <div className="flex flex-col items-center rounded-2xl bg-[var(--bg-surface)] px-6 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Clock3 size={18} className="text-[var(--primary)]" />
            <span className="text-sm">Duration</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
            {formatDuration(snapshot.duration)}
          </p>
        </div>
      </div>

      <p className="mt-8 max-w-md text-[var(--text-muted)]">
        Great study session! Your progress has been saved. Keep up the momentum!
      </p>

      <button
        className="btn-ocean mt-8 flex cursor-pointer items-center gap-2 rounded-2xl px-6 py-3 text-base font-semibold text-white shadow-lg"
        onClick={() => {
          void handleGoHomeFromEnded()
        }}
        type="button"
      >
        <ArrowLeft size={18} />
        Back to Home
      </button>
    </div>
  )
}
