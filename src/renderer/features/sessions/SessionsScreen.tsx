import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '../../../shared/types'
import { buildSessionDetailPath } from '../../navigation/routes'
import AllSessionsPage from './components/AllSessionsPage'

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<Session[]>([])
  const navigate = useNavigate()

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

  return (
    <AllSessionsPage
      onBack={() => {
        navigate(-1) 
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
