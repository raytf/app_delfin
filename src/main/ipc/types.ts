import type { BrowserWindow } from 'electron'
import type {
  MinimizedOverlayVariant,
  OverlayMode,
  OverlayState,
  SessionMode,
} from '../../shared/types'

export interface RegisterIpcHandlersOptions {
  getOverlayState: () => OverlayState
  getMainWindow: () => BrowserWindow | null
  sidecarWsUrl: string
  setMinimizedVariant: (variant: MinimizedOverlayVariant) => void
  switchOverlayMode: (mode: OverlayMode) => Promise<void>
  setSessionMode: (mode: SessionMode) => void
}
