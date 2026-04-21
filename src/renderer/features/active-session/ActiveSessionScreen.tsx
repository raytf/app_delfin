import { useEffect, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EndedSessionSnapshot, OverlayState } from '../../../shared/types'
import { OverlayLoadScreen, useOverlayRouteSync } from '../shared/hooks/useOverlayRouting'
import { ROUTES } from '../../navigation/routes'
import {
  activeScreenStateFromOverlayState,
  activeScreenStateReducer,
} from '../../navigation/screenState'
import { useOverlayStore } from '../../stores/overlayStore'
import ExpandedSessionView from './components/ExpandedSessionView'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import { useActiveSessionController } from './hooks/useActiveSessionController'

const FALLBACK_ACTIVE_OVERLAY_STATE: OverlayState = {
  endedSessionData: null,
  minimizedVariant: 'compact',
  overlayMode: 'expanded',
  sessionMode: 'active',
}

export default function ActiveSessionScreen() {
  const navigate = useNavigate()
  const { overlayState, reconcileOverlayStateFromMain } = useOverlayRouteSync()
  const activeSessionName = useOverlayStore((state) => state.activeSessionName)
  const beginSessionEnd = useOverlayStore((state) => state.beginSessionEnd)
  const commitSessionEnd = useOverlayStore((state) => state.commitSessionEnd)
  const reducerOverlayState = overlayState ?? FALLBACK_ACTIVE_OVERLAY_STATE
  const [screenState, transitionScreen] = useReducer(
    activeScreenStateReducer,
    reducerOverlayState,
    activeScreenStateFromOverlayState,
  )

  const handleBeginSessionEnd = (snapshot: EndedSessionSnapshot): void => {
    beginSessionEnd(snapshot)
    navigate(ROUTES.sessionEnded, { replace: true })
  }

  const handleSessionEndCommitted = (snapshot: EndedSessionSnapshot): void => {
    commitSessionEnd(snapshot)
    navigate(ROUTES.sessionEnded, { replace: true })
  }

  const controller = useActiveSessionController({
    onBeginSessionEnd: handleBeginSessionEnd,
    onSessionEndCommitted: handleSessionEndCommitted,
    reconcileScreenStateFromMain: reconcileOverlayStateFromMain,
    screenState,
    sessionName: activeSessionName,
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
        minimizedVariant={screenState.variant}
        onAskAnother={() => {
          void controller.handleAskAnother()
        }}
        onOpen={() => {
          void controller.handleRestoreOverlay()
        }}
        onSetPromptOpen={(isOpen) => {
          void controller.handleSetMinimizedVariant(isOpen ? 'prompt-input' : 'compact')
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
      sessionName={activeSessionName}
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
