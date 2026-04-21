import { useNavigate } from 'react-router-dom'
import type { EndedSessionSnapshot } from '../../../shared/types'
import { OverlayLoadScreen, useOverlayState } from '../../hooks/useOverlayState'
import { ROUTES } from '../../navigation/routes'
import { useSessionStore } from '../../stores/sessionStore'
import ExpandedSessionView from './components/ExpandedSessionView'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import { useActiveSession } from './hooks/useActiveSession'

export default function ActiveSessionScreen() {
  const navigate = useNavigate()
  const { overlayState } = useOverlayState()
  const activeSessionName = useSessionStore((state) => state.activeSessionName)
  const setActiveSessionName = useSessionStore((state) => state.setActiveSessionName)
  const setEndedSessionSnapshot = useSessionStore((state) => state.setEndedSessionSnapshot)

  const handleBeginSessionEnd = (snapshot: EndedSessionSnapshot): void => {
    setEndedSessionSnapshot(snapshot)
    navigate(ROUTES.sessionEnded, { replace: true })
  }

  const handleSessionEndCommitted = (snapshot: EndedSessionSnapshot): void => {
    setActiveSessionName(null)
    setEndedSessionSnapshot(snapshot)
    navigate(ROUTES.sessionEnded, { replace: true })
  }

  const session = useActiveSession({
    onBeginSessionEnd: handleBeginSessionEnd,
    onSessionEndCommitted: handleSessionEndCommitted,
    sessionName: activeSessionName ?? 'Study Session',
  })

  if (overlayState === null) {
    return <OverlayLoadScreen message="Loading Delfin..." />
  }

  if (overlayState.mode !== 'expanded') {
    return (
      <MinimizedSessionBar
        errorMessage={session.errorMessage}
        isAudioPlaying={session.isAudioPlaying}
        isSubmitting={session.isSubmitting}
        isMicListening={session.isListening}
        isMicMuted={session.isMuted}
        latestResponseText={session.latestResponseText}
        mode={overlayState.mode}
        onAskAnother={() => {
          void session.handleAskAnother()
        }}
        onOpen={() => {
          void session.handleRestoreOverlay()
        }}
        onSetMode={(mode) => {
          void session.handleSetMode(mode)
        }}
        onSubmitPrompt={(text) => {
          void session.handleSubmitPrompt(text)
        }}
        onStop={() => {
          void session.handleStopSession()
        }}
        onToggleVadListening={session.toggleVadListening}
        vadListeningEnabled={session.vadListeningEnabled}
        waveformState={session.waveformState}
      />
    )
  }

  return (
    <ExpandedSessionView
      errorMessage={session.errorMessage}
      isAudioPlaying={session.isAudioPlaying}
      isSubmitting={session.isSubmitting}
      messages={session.messages}
      sessionName={activeSessionName ?? 'Study Session'}
      onMinimize={() => {
        void session.handleMinimizeOverlay()
      }}
      onStop={() => {
        void session.handleStopSession()
      }}
      onSubmitPrompt={(text) => {
        void session.handleSubmitPrompt(text)
      }}
      onToggleVadListening={session.toggleVadListening}
      vadListeningEnabled={session.vadListeningEnabled}
      waveformState={session.waveformState}
    />
  )
}
