import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionListItem } from '../../../shared/types'
import { OverlayLoadScreen, useOverlayState } from '../../hooks/useOverlayState'
import { buildSessionDetailPath, ROUTES } from '../../navigation/routes'
import AllSessionsPage from './components/AllSessionsPage'

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const navigate = useNavigate()
  const { overlayState } = useOverlayState()

  useEffect(() => {
    let cancelled = false

    void window.api.listSessions().then((nextSessions) => {
      if (!cancelled) {
        setSessions(nextSessions)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleDeleteSession = useCallback(async (sessionId: string): Promise<void> => {
    await window.api.deleteSession({ sessionId })
    setSessions((currentSessions) =>
      currentSessions.filter((session) => session.id !== sessionId),
    )
  }, [])

  if (overlayState === null) {
    return <OverlayLoadScreen message="Loading Delfin..." />
  }

  return (
    <AllSessionsPage
      onBack={() => {
        navigate(ROUTES.home)
      }}
      onDeleteSession={(sessionId) => {
        void handleDeleteSession(sessionId)
      }}
      onSelectSession={(sessionId) => {
        navigate(buildSessionDetailPath(sessionId))
      }}
      sessions={sessions}
    />
  )
}
