import { create } from 'zustand'
import type { OverlayState } from '../../shared/types'

function createDefaultOverlayState(): OverlayState {
  return {
    mode: 'expanded',
  }
}

interface OverlayStoreState {
  overlayState: OverlayState | null
  setOverlayState: (overlayState: OverlayState) => void
  reconcileOverlayStateFromMain: () => Promise<void>
  resetOverlayState: () => void
}

export const useOverlayStore = create<OverlayStoreState>()((set) => ({
  overlayState: null,

  setOverlayState: (overlayState) =>
    set({
      overlayState,
    }),

  reconcileOverlayStateFromMain: async () => {
    try {
      const nextOverlayState = await window.api.getOverlayState()
      set({
        overlayState: nextOverlayState,
      })
    } catch (error) {
      console.error('[overlayStore] Failed to reconcile overlay state from main:', error)
    }
  },

  resetOverlayState: () =>
    set({
      overlayState: createDefaultOverlayState(),
    }),
}))
