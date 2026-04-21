import { useEffect } from 'react'
import { useOverlayStore } from '../stores/overlayStore'

export function OverlayLoadScreen({ message }: { message: string }) {
  return (
    <div className="ocean-gradient flex min-h-screen items-center justify-center px-8 py-12 text-[var(--text-secondary)]">
      {message}
    </div>
  )
}

export function useOverlayState(): {
  overlayState: ReturnType<typeof useOverlayStore.getState>['overlayState']
  reconcileOverlayStateFromMain: () => Promise<void>
} {
  const overlayState = useOverlayStore((state) => state.overlayState)
  const reconcileOverlayStateFromMain = useOverlayStore(
    (state) => state.reconcileOverlayStateFromMain,
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
  }
}
