import { create } from 'zustand'
import type { EndedSessionSnapshot, OverlayState } from '../../shared/types'

const DEFAULT_SESSION_NAME = 'Study Session'

function createHomeOverlayState(
  endedSessionData: EndedSessionSnapshot | null = null,
): OverlayState {
  return {
    endedSessionData,
    minimizedVariant: 'compact',
    overlayMode: 'expanded',
    sessionMode: 'home',
  }
}

function createActiveOverlayState(): OverlayState {
  return {
    endedSessionData: null,
    minimizedVariant: 'compact',
    overlayMode: 'minimized',
    sessionMode: 'active',
  }
}

interface OverlayStoreState {
  activeSessionName: string
  overlayState: OverlayState | null
  pendingEndedSession: EndedSessionSnapshot | null
  beginSessionEnd: (snapshot: EndedSessionSnapshot) => void
  commitSessionEnd: (snapshot: EndedSessionSnapshot) => void
  markSessionStarted: (sessionName: string) => void
  reconcileOverlayStateFromMain: () => Promise<void>
  resetToHome: () => void
}

export const useOverlayStore = create<OverlayStoreState>()((set) => ({
  activeSessionName: DEFAULT_SESSION_NAME,
  overlayState: null,
  pendingEndedSession: null,

  beginSessionEnd: (snapshot) =>
    set({
      overlayState: createHomeOverlayState(snapshot),
      pendingEndedSession: snapshot,
    }),

  commitSessionEnd: (snapshot) =>
    set({
      activeSessionName: DEFAULT_SESSION_NAME,
      overlayState: createHomeOverlayState(snapshot),
      pendingEndedSession: null,
    }),

  markSessionStarted: (sessionName) =>
    set({
      activeSessionName: sessionName,
      overlayState: createActiveOverlayState(),
      pendingEndedSession: null,
    }),

  reconcileOverlayStateFromMain: async () => {
    try {
      const nextOverlayState = await window.api.getOverlayState()
      set((state) => ({
        overlayState: nextOverlayState,
        pendingEndedSession:
          nextOverlayState.endedSessionData !== null ? null : state.pendingEndedSession,
      }))
    } catch (error) {
      console.error('[overlayStore] Failed to reconcile overlay state from main:', error)
    }
  },

  resetToHome: () =>
    set({
      activeSessionName: DEFAULT_SESSION_NAME,
      overlayState: createHomeOverlayState(),
      pendingEndedSession: null,
    }),
}))
