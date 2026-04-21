import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionListItem } from '../../../shared/types'
import { OverlayLoadScreen, useOverlayRouteSync } from '../shared/hooks/useOverlayRouting'
import { buildSessionDetailPath, ROUTES } from '../../navigation/routes'
import { useOverlayStore } from '../../stores/overlayStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import LandingHomeScreen from './components/LandingHomeScreen'
import UserNameModal from './components/UserNameModal'

export default function HomeScreen() {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const navigate = useNavigate()
  const { overlayState } = useOverlayRouteSync()
  const markSessionStarted = useOverlayStore((state) => state.markSessionStarted)
  const clearConversation = useSessionStore((state) => state.clearConversation)
  const startSession = useSessionStore((state) => state.startSession)
  const setUserName = useSettingsStore((state) => state.setUserName)
  const userName = useSettingsStore((state) => state.userName)

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

  const handleStartSession = useCallback(async (sessionName: string): Promise<void> => {
    await window.api.startSession({ sessionName })
    clearConversation()
    startSession()
    markSessionStarted(sessionName)
    navigate(ROUTES.active, { replace: true })
  }, [clearConversation, markSessionStarted, navigate, startSession])

  if (overlayState === null) {
    return <OverlayLoadScreen message="Loading Delfin..." />
  }

  return (
    <>
      <LandingHomeScreen
        onDeleteSession={(sessionId) => {
          void handleDeleteSession(sessionId)
        }}
        onSelectSession={(sessionId) => {
          navigate(buildSessionDetailPath(sessionId))
        }}
        onStartSession={(sessionName) => {
          void handleStartSession(sessionName)
        }}
        onViewAllSessions={() => {
          navigate(ROUTES.sessions)
        }}
        sessions={sessions}
        userName={userName}
      />
      <UserNameModal
        isOpen={userName === null}
        onSave={setUserName}
      />
    </>
  )
}
