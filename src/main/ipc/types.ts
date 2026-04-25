import type { BrowserWindow } from 'electron'
import type {
  OverlayMode,
  OverlayState,
} from '../../shared/types'
import type { SessionPersistenceService } from '../session/sessionPersistenceService'

export interface RegisterIpcHandlersOptions {
  getOverlayState: () => OverlayState
  getMainWindow: () => BrowserWindow | null
  sessionPersistence: SessionPersistenceService
  sidecarWsUrl: string
  switchOverlayMode: (mode: OverlayMode) => Promise<void>
}
