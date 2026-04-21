import { useEffect, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EndedSessionSnapshot, OverlayState } from '../../../shared/types'
import { OverlayLoadScreen, useOverlayState } from '../../hooks/useOverlayState'
import { ROUTES } from '../../navigation/routes'
import {
  activeScreenStateFromOverlayState,
  activeScreenStateReducer,
} from '../../navigation/screenState'
import { useSessionStore } from '../../stores/sessionStore'
import ExpandedSessionView from './components/ExpandedSessionView'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import { useActiveSessionController } from './hooks/useActiveSessionController'

const FALLBACK_ACTIVE_OVERLAY_STATE: OverlayState = {
  mode: 'expanded',
}

export default function ActiveSessionScreen() {
  const navigate = useNavigate()
  const { overlayState, reconcileOverlayStateFromMain } = useOverlayState()
  const activeSessionName = useSessionStore((state) => state.activeSessionName)
  const setActiveSessionName = useSessionStore((state) => state.setActiveSessionName)
  const setEndedSessionSnapshot = useSessionStore((state) => state.setEndedSessionSnapshot)
  const reducerOverlayState = overlayState ?? FALLBACK_ACTIVE_OVERLAY_STATE
  const [screenState, transitionScreen] = useReducer(
    activeScreenStateReducer,
    reducerOverlayState,
    activeScreenStateFromOverlayState,
  )

  const handleBeginSessionEnd = (snapshot: EndedSessionSnapshot): void => {
    setEndedSessionSnapshot(snapshot)
    navigate(ROUTES.sessionEnded, { replace: true })
  }

  const handleSessionEndCommitted = (snapshot: EndedSessionSnapshot): void => {
    setActiveSessionName(null)
    setEndedSessionSnapshot(snapshot)
    navigate(ROUTES.sessionEnded, { replace: true })
  }

  const controller = useActiveSessionController({
    onBeginSessionEnd: handleBeginSessionEnd,
    onSessionEndCommitted: handleSessionEndCommitted,
    reconcileScreenStateFromMain: reconcileOverlayStateFromMain,
    screenState,
    sessionName: activeSessionName ?? 'Study Session',
    transitionScreen,
  })

  useEffect(() => {
    if (overlayState === null) {
      return
    }

    transitionScreen({
      type: 'SYNC_FROM_MAIN',
      overlayState,
    })
  }, [overlayState, transitionScreen])

  if (overlayState === null) {
    return <OverlayLoadScreen message="Loading Delfin..." />
  }

  if (screenState.kind === 'active-minimized') {
    return (
      <MinimizedSessionBar
        errorMessage={controller.errorMessage}
        isAudioPlaying={controller.isAudioPlaying}
        isSubmitting={controller.isSubmitting}
        isMicListening={controller.isListening}
        isMicMuted={controller.isMuted}
        latestResponseText={controller.latestResponseText}
        mode={screenState.mode}
        onAskAnother={() => {
          void controller.handleAskAnother()
        }}
        onOpen={() => {
          void controller.handleRestoreOverlay()
        }}
        onSetMode={(mode) => {
          void controller.handleSetMode(mode)
        }}
        onSubmitPrompt={(text) => {
          void controller.handleSubmitPrompt(text)
        }}
        onStop={() => {
          void controller.handleStopSession()
        }}
        onToggleVadListening={controller.toggleVadListening}
        vadListeningEnabled={controller.vadListeningEnabled}
        waveformState={controller.waveformState}
      />
    )
  }

  return (
    <ExpandedSessionView
      errorMessage={controller.errorMessage}
      isAudioPlaying={controller.isAudioPlaying}
      isSubmitting={controller.isSubmitting}
      messages={controller.messages}
      sessionName={activeSessionName ?? 'Study Session'}
      onMinimize={() => {
        void controller.handleMinimizeOverlay()
      }}
      onStop={() => {
        void controller.handleStopSession()
      }}
      onSubmitPrompt={(text) => {
        void controller.handleSubmitPrompt(text)
      }}
      onToggleVadListening={controller.toggleVadListening}
      vadListeningEnabled={controller.vadListeningEnabled}
      waveformState={controller.waveformState}
    />
  )
}
