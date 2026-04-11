import { ipcMain } from 'electron'
import { IPC_CHANNELS, type OverlayMode, type OverlayState, type SessionMode } from '../../shared/types'

interface RegisterIpcHandlersOptions {
  getOverlayState: () => OverlayState
  switchOverlayMode: (mode: OverlayMode) => Promise<void>
  setSessionMode: (mode: SessionMode) => void
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  ipcMain.handle(IPC_CHANNELS.OVERLAY_GET_STATE, async () => options.getOverlayState())

  ipcMain.handle(IPC_CHANNELS.SESSION_START, async () => {
    options.setSessionMode('active')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    options.setSessionMode('home')
    await options.switchOverlayMode('expanded')
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_MINIMIZE, async () => {
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_RESTORE, async () => {
    await options.switchOverlayMode('expanded')
  })
}
