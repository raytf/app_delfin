import { useEffect, useState } from 'react'
import ExpandedSessionView from './components/ExpandedSessionView'
import HomeScreen from './components/HomeScreen'
import MinimizedSessionBar from './components/MinimizedSessionBar'
import type { OverlayMode, SessionMode } from '../shared/types'

export default function App() {
  const [sessionMode, setSessionMode] = useState<SessionMode>('home')
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('expanded')

  useEffect(() => {
    let cancelled = false

    void window.api.getOverlayState().then((state) => {
      if (cancelled) {
        return
      }

      setSessionMode(state.sessionMode)
      setOverlayMode(state.overlayMode)
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleStartSession(): Promise<void> {
    await window.api.startSession()
    setSessionMode('active')
    setOverlayMode('minimized')
  }

  async function handleRestoreOverlay(): Promise<void> {
    await window.api.restoreOverlay()
    setOverlayMode('expanded')
  }

  async function handleMinimizeOverlay(): Promise<void> {
    await window.api.minimizeOverlay()
    setOverlayMode('minimized')
  }

  async function handleStopSession(): Promise<void> {
    await window.api.stopSession()
    setSessionMode('home')
    setOverlayMode('expanded')
  }

  if (sessionMode === 'active' && overlayMode === 'minimized') {
    return (
      <MinimizedSessionBar
        onOpen={() => {
          void handleRestoreOverlay()
        }}
        onStop={() => {
          void handleStopSession()
        }}
      />
    )
  }

  if (sessionMode === 'active') {
    return (
      <ExpandedSessionView
        onMinimize={() => {
          void handleMinimizeOverlay()
        }}
        onStop={() => {
          void handleStopSession()
        }}
      />
    )
  }

  return (
    <HomeScreen
      onStartSession={() => {
        void handleStartSession()
      }}
    />
  )
}
