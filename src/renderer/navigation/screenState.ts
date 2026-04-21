import type {
  MinimizedOverlayVariant,
  OverlayMode,
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

export function getOverlayModeForMinimizedVariant(
  variant: MinimizedOverlayVariant,
): OverlayMode {
  switch (variant) {
    case 'prompt-input':
      return 'minimized-prompt-input'
    case 'prompt-response':
      return 'minimized-prompt-response'
    case 'compact':
    default:
      return 'minimized-compact'
  }
}

export function getMinimizedVariantFromOverlayMode(
  mode: OverlayMode,
): MinimizedOverlayVariant | null {
  switch (mode) {
    case 'minimized-prompt-input':
      return 'prompt-input'
    case 'minimized-prompt-response':
      return 'prompt-response'
    case 'minimized-compact':
      return 'compact'
    case 'expanded':
    default:
      return null
  }
}

export function activeScreenStateFromOverlayState(
  overlayState: OverlayState,
): ActiveScreenState {
  const minimizedVariant = getMinimizedVariantFromOverlayMode(overlayState.mode)

  if (minimizedVariant !== null) {
    return {
      kind: 'active-minimized',
      variant: minimizedVariant,
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
