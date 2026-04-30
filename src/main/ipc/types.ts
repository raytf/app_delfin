import type { BrowserWindow } from 'electron'
import type {
  OverlayMode,
  OverlayState,
} from '../../shared/types'
import type { SidecarSessionClient } from '../sidecar/session/api'

export interface RegisterIpcHandlersOptions {
  getOverlayState: () => OverlayState
  getMainWindow: () => BrowserWindow | null
  sidecarSessionClient: SidecarSessionClient
  sidecarWsUrl: string
  switchOverlayMode: (mode: OverlayMode) => Promise<void>
}
