import { ipcMain } from 'electron'
import {
  MAIN_TO_RENDERER_CHANNELS,
  RENDERER_TO_MAIN_CHANNELS,
  type OverlayMode,
} from '../../shared/types'
import type { RegisterIpcHandlersOptions } from './types'

function forwardOverlayError(options: RegisterIpcHandlersOptions, message: string): void {
  const mainWindow = options.getMainWindow()

  if (mainWindow === null || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR, { message })
}

export function registerOverlayIpcHandlers(options: RegisterIpcHandlersOptions): void {
  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_GET_STATE, async () => options.getOverlayState())

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MODE, async (_event, mode: OverlayMode) => {
    const previousMode = options.getOverlayState().mode

    try {
      await options.switchOverlayMode(mode)
    } catch (error) {
      await options.switchOverlayMode(previousMode)

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to set overlay mode.'

      console.error('[overlayHandlers] Failed to set overlay mode:', error)
      forwardOverlayError(options, errorMessage)

      throw (error instanceof Error ? error : new Error(errorMessage))
    }
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.WINDOW_MINIMIZE, async () => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available.')
    }

    mainWindow.minimize()
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, async () => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available.')
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return
    }

    mainWindow.maximize()
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.WINDOW_CLOSE, async () => {
    const mainWindow = options.getMainWindow()

    if (mainWindow === null || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available.')
    }

    mainWindow.close()
  })
}
