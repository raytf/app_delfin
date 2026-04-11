import { ipcMain, type BrowserWindow } from 'electron'
import { captureForegroundWindow } from '../capture/captureService'
import {
  IPC_CHANNELS,
  type MinimizedOverlayVariant,
  type OverlayMode,
  type OverlayState,
  type SessionMode,
  type SessionPromptRequest,
} from '../../shared/types'

interface RegisterIpcHandlersOptions {
  getOverlayState: () => OverlayState
  getMainWindow: () => BrowserWindow | null
  setMinimizedVariant: (variant: MinimizedOverlayVariant) => void
  switchOverlayMode: (mode: OverlayMode) => Promise<void>
  setSessionMode: (mode: SessionMode) => void
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  ipcMain.handle(IPC_CHANNELS.OVERLAY_GET_STATE, async () => options.getOverlayState())

  ipcMain.handle(IPC_CHANNELS.SESSION_START, async () => {
    options.setSessionMode('active')
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    options.setSessionMode('home')
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('expanded')
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_MINIMIZE, async () => {
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_RESTORE, async () => {
    await options.switchOverlayMode('expanded')
  })

  ipcMain.handle(IPC_CHANNELS.OVERLAY_SET_MINIMIZED_VARIANT, async (_event, variant: MinimizedOverlayVariant) => {
    options.setMinimizedVariant(variant)
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_SUBMIT_PROMPT, async (_event, request: SessionPromptRequest) => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available.')
    }

    const text = request.text.trim()

    if (text.length === 0) {
      throw new Error('Prompt cannot be empty.')
    }

    const frame = await captureForegroundWindow()

    mainWindow.webContents.send(IPC_CHANNELS.FRAME_CAPTURED, frame)
  })
}
