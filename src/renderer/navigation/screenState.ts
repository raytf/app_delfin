import type {
  OverlayMode,
  OverlayState,
} from '../../shared/types'

export type ActiveScreenState =
  | { kind: 'active-expanded' }
  | { kind: 'active-minimized'; mode: Exclude<OverlayMode, 'expanded'> }

export type ActiveScreenAction =
  | { type: 'SYNC_FROM_MAIN'; overlayState: OverlayState }
  | { type: 'MINIMIZE'; mode: Exclude<OverlayMode, 'expanded'> }
  | { type: 'RESTORE' }
  | { type: 'SHOW_MODE'; mode: Exclude<OverlayMode, 'expanded'> }

export function activeScreenStateFromOverlayState(
  overlayState: OverlayState,
): ActiveScreenState {
  if (overlayState.mode !== 'expanded') {
    return {
      kind: 'active-minimized',
      mode: overlayState.mode,
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
    case 'SHOW_MODE':
      return {
        kind: 'active-minimized',
        mode: action.mode,
      }
    case 'RESTORE':
      return { kind: 'active-expanded' }
    default:
      return state
  }
}
