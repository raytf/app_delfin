import type {
  MinimizedOverlayVariant,
  OverlayState,
} from '../../shared/types'

export type ActiveScreenState =
  | { kind: 'active-expanded' }
  | { kind: 'active-minimized'; variant: MinimizedOverlayVariant }

export type ActiveScreenAction =
  | { type: 'SYNC_FROM_MAIN'; overlayState: OverlayState }
  | { type: 'MINIMIZE'; variant: MinimizedOverlayVariant }
  | { type: 'RESTORE' }
  | { type: 'SHOW_MINIMIZED_VARIANT'; variant: MinimizedOverlayVariant }

export function activeScreenStateFromOverlayState(
  overlayState: OverlayState,
): ActiveScreenState {
  if (overlayState.overlayMode === 'minimized') {
    return {
      kind: 'active-minimized',
      variant: overlayState.minimizedVariant,
    }
  }

  return { kind: 'active-expanded' }
}

export function activeScreenStateReducer(
  state: ActiveScreenState,
  action: ActiveScreenAction,
): ActiveScreenState {
  switch (action.type) {
    case 'SYNC_FROM_MAIN':
      return activeScreenStateFromOverlayState(action.overlayState)
    case 'MINIMIZE':
    case 'SHOW_MINIMIZED_VARIANT':
      return {
        kind: 'active-minimized',
        variant: action.variant,
      }
    case 'RESTORE':
      return { kind: 'active-expanded' }
    default:
      return state
  }
}
