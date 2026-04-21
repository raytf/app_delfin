import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getRouteSyncTarget } from '../../../navigation/routes'
import { useOverlayStore } from '../../../stores/overlayStore'

export function OverlayLoadScreen({ message }: { message: string }) {
  return (
    <div className="ocean-gradient flex min-h-screen items-center justify-center px-8 py-12 text-[var(--text-secondary)]">
      {message}
    </div>
  )
}

export function useOverlayRouteSync(): {
  overlayState: ReturnType<typeof useOverlayStore.getState>['overlayState']
  reconcileOverlayStateFromMain: () => Promise<void>
} {
  const location = useLocation()
  const navigate = useNavigate()
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

  useEffect(() => {
    if (overlayState === null) {
      return
    }

    const nextRoute = getRouteSyncTarget(location.pathname, overlayState)
    if (nextRoute !== null && nextRoute !== location.pathname) {
      navigate(nextRoute, { replace: true })
    }
  }, [location.pathname, navigate, overlayState])

  return {
    overlayState,
    reconcileOverlayStateFromMain,
  }
}
