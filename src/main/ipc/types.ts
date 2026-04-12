import type { BrowserWindow } from 'electron'
import type {
  EndedSessionSnapshot,
  MinimizedOverlayVariant,
  OverlayMode,
  OverlayState,
  SessionMode,
} from '../../shared/types'
import type { SessionPersistenceService } from '../session/sessionPersistenceService'

export interface RegisterIpcHandlersOptions {
  getOverlayState: () => OverlayState
  getMainWindow: () => BrowserWindow | null
  sessionPersistence: SessionPersistenceService
  sidecarWsUrl: string
  clearEndedSessionData: () => void
  setEndedSessionData: (data: EndedSessionSnapshot | null) => void
  setMinimizedVariant: (variant: MinimizedOverlayVariant) => void
  switchOverlayMode: (mode: OverlayMode) => Promise<void>
  setSessionMode: (mode: SessionMode) => void
}
