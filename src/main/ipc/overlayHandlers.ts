import { ipcMain } from 'electron'
import {
  MAIN_TO_RENDERER_CHANNELS,
  RENDERER_TO_MAIN_CHANNELS,
  type MinimizedOverlayVariant,
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
  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_CLEAR_ENDED_SESSION, async () => {
    options.clearEndedSessionData()
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_MINIMIZE, async () => {
    options.setMinimizedVariant('compact')
    await options.switchOverlayMode('minimized')
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_RESTORE, async () => {
    await options.switchOverlayMode('expanded')
  })

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MINIMIZED_VARIANT, async (_event, variant: MinimizedOverlayVariant) => {
    const previousVariant = options.getOverlayState().minimizedVariant

    try {
      options.setMinimizedVariant(variant)
      await options.switchOverlayMode('minimized')
    } catch (error) {
      options.setMinimizedVariant(previousVariant)

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to set minimized overlay variant.'

      console.error('[overlayHandlers] Failed to set minimized overlay variant:', error)
      forwardOverlayError(options, errorMessage)

      throw (error instanceof Error ? error : new Error(errorMessage))
    }
  })
}
