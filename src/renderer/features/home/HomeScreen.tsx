import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionListItem } from '../../../shared/types'
import { OverlayLoadScreen, useOverlayState } from '../../hooks/useOverlayState'
import { buildSessionDetailPath, ROUTES } from '../../navigation/routes'
import { useOverlayStore } from '../../stores/overlayStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import LandingHomeScreen from './components/LandingHomeScreen'
import UserNameModal from './components/UserNameModal'

export default function HomeScreen() {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const navigate = useNavigate()
  const { overlayState } = useOverlayState()
  const setOverlayState = useOverlayStore((state) => state.setOverlayState)
  const clearConversation = useSessionStore((state) => state.clearConversation)
  const clearEndedSessionSnapshot = useSessionStore((state) => state.clearEndedSessionSnapshot)
  const setActiveSessionName = useSessionStore((state) => state.setActiveSessionName)
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
    clearEndedSessionSnapshot()
    startSession()
    setActiveSessionName(sessionName)
    setOverlayState({
      mode: 'minimized-compact',
    })
    navigate(ROUTES.active, { replace: true })
  }, [
    clearConversation,
    clearEndedSessionSnapshot,
    navigate,
    setActiveSessionName,
    setOverlayState,
    startSession,
  ])

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
