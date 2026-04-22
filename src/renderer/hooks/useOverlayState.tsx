import { useCallback, useEffect } from 'react'
import type { OverlayMode } from '../../shared/types'
import { useOverlayStore } from '../stores/overlayStore'

export function useOverlayState(): {
  overlayState: ReturnType<typeof useOverlayStore.getState>['overlayState']
  reconcileOverlayStateFromMain: () => Promise<void>
  setOverlayMode: (mode: OverlayMode) => Promise<void>
} {
  const overlayState = useOverlayStore((state) => state.overlayState)
  const setOverlayState = useOverlayStore((state) => state.setOverlayState)
  const reconcileOverlayStateFromMain = useOverlayStore(
    (state) => state.reconcileOverlayStateFromMain,
  )

  const setOverlayMode = useCallback(
    async (mode: OverlayMode): Promise<void> => {
      setOverlayState({ mode })

      try {
        await window.api.setOverlayMode(mode)
      } catch (error) {
        await reconcileOverlayStateFromMain()
        throw error
      }
    },
    [reconcileOverlayStateFromMain, setOverlayState],
  )

  useEffect(() => {
    if (overlayState !== null) {
      return
    }
    
    void reconcileOverlayStateFromMain()
  }, [overlayState, reconcileOverlayStateFromMain])

  return {
    overlayState,
    reconcileOverlayStateFromMain,
    setOverlayMode,
  }
}
